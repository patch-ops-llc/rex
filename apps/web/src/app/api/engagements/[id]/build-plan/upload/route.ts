import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";
import type { BuildPlanData } from "@rex/shared";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const engagement = await prisma.engagement.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        name: true,
        clientName: true,
      },
    });

    if (!engagement) {
      return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
    }

    const contentType = request.headers.get("content-type") || "";
    let planData: BuildPlanData;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }
      const text = await file.text();
      planData = JSON.parse(text);
    } else {
      planData = await request.json();
    }

    const errors = validateBuildPlan(planData);
    if (errors.length > 0) {
      return NextResponse.json(
        { error: "Invalid build plan", validationErrors: errors },
        { status: 400 },
      );
    }

    if (!planData.engagement) {
      planData.engagement = {
        name: engagement.name,
        clientName: engagement.clientName,
      };
    }
    planData.propertyGroups ??= [];
    planData.properties ??= [];
    planData.customObjects ??= [];
    planData.associations ??= [];
    planData.pipelines ??= [];
    planData.workflows ??= [];
    planData.lists ??= [];
    planData.views ??= [];
    planData.humanRequiredItems ??= [];
    planData.qaChecklist ??= [];

    const buildPlan = await prisma.buildPlan.upsert({
      where: { engagementId: params.id },
      update: {
        planData: planData as any,
        version: { increment: 1 },
        status: "DRAFT",
        approvedBy: null,
        approvedAt: null,
      },
      create: {
        engagementId: params.id,
        planData: planData as any,
        status: "DRAFT",
      },
    });

    await prisma.deliveryLogEntry.create({
      data: {
        engagementId: params.id,
        action: "BUILD_PLAN_UPLOADED",
        phaseType: "BUILD_PLANNING",
        actor: "user",
        description: `Build plan v${buildPlan.version} uploaded manually`,
        metadata: {
          buildPlanId: buildPlan.id,
          version: buildPlan.version,
          source: "upload",
        },
      },
    });

    return NextResponse.json(buildPlan, { status: 201 });
  } catch (error: any) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Invalid JSON in uploaded file" },
        { status: 400 },
      );
    }
    console.error("Build plan upload failed:", error);
    return NextResponse.json(
      { error: error.message || "Upload failed" },
      { status: 500 },
    );
  }
}

function validateBuildPlan(data: any): string[] {
  const errors: string[] = [];

  if (!data || typeof data !== "object") {
    errors.push("Build plan must be a JSON object");
    return errors;
  }

  if (data.properties && !Array.isArray(data.properties)) {
    errors.push("properties must be an array");
  }
  if (data.propertyGroups && !Array.isArray(data.propertyGroups)) {
    errors.push("propertyGroups must be an array");
  }
  if (data.customObjects && !Array.isArray(data.customObjects)) {
    errors.push("customObjects must be an array");
  }
  if (data.pipelines && !Array.isArray(data.pipelines)) {
    errors.push("pipelines must be an array");
  }
  if (data.workflows && !Array.isArray(data.workflows)) {
    errors.push("workflows must be an array");
  }
  if (data.lists && !Array.isArray(data.lists)) {
    errors.push("lists must be an array");
  }

  const hasContent =
    data.properties?.length ||
    data.propertyGroups?.length ||
    data.customObjects?.length ||
    data.pipelines?.length ||
    data.workflows?.length ||
    data.lists?.length ||
    data.associations?.length ||
    data.humanRequiredItems?.length;

  if (!hasContent) {
    errors.push("Build plan must contain at least one item (properties, pipelines, workflows, etc.)");
  }

  return errors;
}
