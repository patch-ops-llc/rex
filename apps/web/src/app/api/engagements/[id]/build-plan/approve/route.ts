import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";
import type { BuildPlanData } from "@rex/shared";
import { pipeline } from "@rex/shared";
import { filterRejectedPlanItems } from "@rex/shared";
import { publishEvent } from "@rex/orchestrator";
import { EventType } from "@rex/shared";
import { notifyBuildPlanApproved, notifyBuildPlanRejected } from "@/lib/notifications";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const body = await request.json();
    const { action, approvedBy, reason } = body as {
      action: "approve" | "reject";
      approvedBy?: string;
      reason?: string;
    };

    if (!action || !["approve", "reject"].includes(action)) {
      return NextResponse.json(
        { error: "action must be 'approve' or 'reject'" },
        { status: 400 },
      );
    }

    const engagement = await prisma.engagement.findUnique({
      where: { id: params.id },
      include: {
        buildPlan: true,
        hubspotPortals: { where: { isActive: true }, take: 1 },
        slackMapping: true,
      },
    });

    if (!engagement) {
      return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
    }
    if (!engagement.buildPlan) {
      return NextResponse.json({ error: "No build plan exists" }, { status: 400 });
    }

    const validForApproval = ["DRAFT", "PENDING_REVIEW", "REJECTED"];
    if (!validForApproval.includes(engagement.buildPlan.status)) {
      return NextResponse.json(
        { error: `Build plan is ${engagement.buildPlan.status}, cannot ${action}` },
        { status: 400 },
      );
    }

    if (action === "approve") {
      const buildPlan = await prisma.buildPlan.update({
        where: { id: engagement.buildPlan.id },
        data: {
          status: "APPROVED",
          approvedBy: approvedBy || "system",
          approvedAt: new Date(),
        },
      });

      await prisma.engagement.update({
        where: { id: params.id },
        data: { status: "PLAN_REVIEW" },
      });

      const planData = buildPlan.planData as unknown as BuildPlanData;
      const approvedItemsOnlyPlan = filterRejectedPlanItems(planData);
      await generateImplementationTasks(params.id, approvedItemsOnlyPlan);

      await prisma.deliveryLogEntry.create({
        data: {
          engagementId: params.id,
          action: "BUILD_PLAN_APPROVED",
          phaseType: "BUILD_APPROVAL",
          actor: approvedBy || "system",
          description: `Build plan v${buildPlan.version} approved`,
        },
      });

      await publishEvent(EventType.BUILD_PLAN_APPROVED, params.id, {
        buildPlanId: buildPlan.id,
        approvedBy: approvedBy || "system",
      });

      await notifyBuildPlanApproved(params.id, engagement.clientName, buildPlan.version);

      return NextResponse.json({ ...buildPlan, status: "APPROVED" });
    } else {
      const buildPlan = await prisma.buildPlan.update({
        where: { id: engagement.buildPlan.id },
        data: { status: "REJECTED" },
      });

      await prisma.deliveryLogEntry.create({
        data: {
          engagementId: params.id,
          action: "BUILD_PLAN_REJECTED",
          phaseType: "BUILD_APPROVAL",
          actor: approvedBy || "system",
          description: `Build plan v${buildPlan.version} rejected${reason ? `: ${reason}` : ""}`,
        },
      });

      await notifyBuildPlanRejected(params.id, engagement.clientName, buildPlan.version, reason);

      return NextResponse.json({ ...buildPlan, status: "REJECTED" });
    }
  } catch (error: any) {
    console.error("Build plan approval failed:", error);
    return NextResponse.json(
      { error: error.message || "Approval failed" },
      { status: 500 },
    );
  }
}

async function generateImplementationTasks(
  engagementId: string,
  planData: BuildPlanData,
) {
  const phases = await prisma.projectPhase.findMany({ where: { engagementId } });
  if (phases.length === 0) {
    await pipeline.initializePipeline(engagementId);
  }

  const implPhase = await prisma.projectPhase.findUnique({
    where: { engagementId_phaseType: { engagementId, phaseType: "IMPLEMENTATION" as any } },
  });

  const cleanupPhase = await prisma.projectPhase.findUnique({
    where: { engagementId_phaseType: { engagementId, phaseType: "HUMAN_CLEANUP" as any } },
  });

  let order = 100;

  const autoSteps = [
    ...(planData.propertyGroups || []).map((g) => ({
      title: `Create property group: ${g.label}`,
      desc: `Property group "${g.name}" on ${g.objectType}`,
      type: "AUTO",
    })),
    ...(planData.customObjects || []).map((o) => ({
      title: `Create custom object: ${o.labels.singular}`,
      desc: `Custom object "${o.name}" with ${o.properties.length} properties`,
      type: "AUTO",
    })),
    ...(planData.properties || []).map((p) => ({
      title: `Create property: ${p.label}`,
      desc: `${p.type} property "${p.name}" on ${p.objectType}`,
      type: "AUTO",
    })),
    ...(planData.associations || []).map((a) => ({
      title: `Create association: ${a.fromObject} → ${a.toObject}`,
      desc: `Association "${a.name}"`,
      type: "AUTO",
    })),
    ...(planData.pipelines || []).map((p) => ({
      title: `Create pipeline: ${p.label}`,
      desc: `${p.objectType} pipeline with ${p.stages.length} stages`,
      type: "AUTO",
    })),
    ...(planData.lists || []).map((l) => ({
      title: `Create list: ${l.name}`,
      desc: `${l.dynamic ? "Dynamic" : "Static"} ${l.objectType} list`,
      type: "AUTO",
    })),
    ...(planData.workflows || []).map((w) => ({
      title: `Create workflow: ${w.name}`,
      desc: `${w.objectType} workflow — ${w.enrollmentTrigger}`,
      type: "AUTO",
    })),
  ];

  if (implPhase) {
    for (const step of autoSteps) {
      await prisma.projectTask.create({
        data: {
          engagementId,
          phaseId: implPhase.id,
          phaseType: "IMPLEMENTATION" as any,
          title: step.title,
          description: step.desc,
          taskType: step.type as any,
          status: "PENDING",
          displayOrder: order++,
        },
      });
    }
  }

  if (cleanupPhase && planData.humanRequiredItems?.length) {
    let humanOrder = 0;
    for (const item of planData.humanRequiredItems) {
      await prisma.projectTask.create({
        data: {
          engagementId,
          phaseId: cleanupPhase.id,
          phaseType: "HUMAN_CLEANUP" as any,
          title: item.description,
          description: `Category: ${item.category}. Reason: ${item.reason}`,
          taskType: "HUMAN" as any,
          status: "PENDING",
          displayOrder: humanOrder++,
        },
      });
    }
  }

  const qaPhase = await prisma.projectPhase.findUnique({
    where: { engagementId_phaseType: { engagementId, phaseType: "UAT" as any } },
  });

  if (qaPhase && planData.qaChecklist?.length) {
    let qaOrder = 0;
    for (const item of planData.qaChecklist) {
      await prisma.projectTask.create({
        data: {
          engagementId,
          phaseId: qaPhase.id,
          phaseType: "UAT" as any,
          title: item.description,
          description: `Category: ${item.category}${item.linkedStepType ? `. Linked to: ${item.linkedStepType}` : ""}`,
          taskType: "REVIEW" as any,
          status: "PENDING",
          displayOrder: qaOrder++,
        },
      });
    }
  }
}
