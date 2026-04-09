import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";
import { generateBuildPlan } from "@rex/build-plan-generator";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const engagement = await prisma.engagement.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        status: true,
        buildPlan: { select: { id: true } },
        _count: {
          select: {
            discoveryCalls: { where: { status: "COMPLETED" } },
          },
        },
      },
    } as any);

    if (!engagement) {
      return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
    }

    const eng = engagement as any;
    if (eng._count.discoveryCalls === 0) {
      return NextResponse.json(
        { error: "No completed discovery calls. Complete at least one discovery session first." },
        { status: 400 }
      );
    }

    const planData = await generateBuildPlan({ engagementId: params.id });

    let buildPlan;
    if (eng.buildPlan) {
      buildPlan = await prisma.buildPlan.update({
        where: { engagementId: params.id },
        data: {
          planData: planData as any,
          version: { increment: 1 },
          status: "DRAFT",
          approvedBy: null,
          approvedAt: null,
        },
      });
    } else {
      buildPlan = await prisma.buildPlan.create({
        data: {
          engagementId: params.id,
          planData: planData as any,
          status: "DRAFT",
        },
      });
    }

    await prisma.engagement.update({
      where: { id: params.id },
      data: { status: "PLAN_GENERATION" },
    });

    await prisma.deliveryLogEntry.create({
      data: {
        engagementId: params.id,
        action: "BUILD_PLAN_GENERATED",
        phaseType: "BUILD_PLANNING",
        actor: "rex",
        description: `Build plan v${buildPlan.version} generated from ${eng._count.discoveryCalls} discovery call(s)`,
        metadata: {
          buildPlanId: buildPlan.id,
          version: buildPlan.version,
        },
      },
    });

    return NextResponse.json(buildPlan, { status: 201 });
  } catch (error: any) {
    console.error("Failed to generate build plan:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate build plan" },
      { status: 500 }
    );
  }
}
