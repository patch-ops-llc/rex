import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";
import { executeBuildPlan } from "@rex/hubspot-engine";
import { notifyImplementationProgress } from "@/lib/notifications";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const body = await request.json().catch(() => ({}));
    const dryRun = body.dryRun === true;

    const engagement = await prisma.engagement.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        clientName: true,
        buildPlan: { select: { id: true, status: true } },
        hubspotPortals: {
          where: { isActive: true },
          select: { id: true, portalId: true },
        },
      },
    });

    if (!engagement) {
      return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
    }

    if (!engagement.buildPlan) {
      return NextResponse.json(
        { error: "No build plan exists. Generate one first." },
        { status: 400 },
      );
    }

    if (engagement.buildPlan.status !== "APPROVED") {
      return NextResponse.json(
        { error: `Build plan is ${engagement.buildPlan.status}. It must be APPROVED before execution.` },
        { status: 400 },
      );
    }

    if (engagement.hubspotPortals.length === 0) {
      return NextResponse.json(
        { error: "No active HubSpot portal linked. Connect and verify a portal first." },
        { status: 400 },
      );
    }

    const summary = await executeBuildPlan({
      engagementId: params.id,
      dryRun,
    });

    if (!dryRun) {
      await notifyImplementationProgress(params.id, engagement.clientName, {
        totalSteps: summary.totalSteps,
        completedSteps: summary.completedSteps,
        failedSteps: summary.failedSteps,
        skippedSteps: summary.skippedSteps,
        humanRequiredCount: summary.humanRequiredItems.length,
      });
    }

    return NextResponse.json(summary, {
      status: summary.failedSteps > 0 ? 207 : 200,
    });
  } catch (error: any) {
    console.error("Implementation execution failed:", error);
    return NextResponse.json(
      { error: error.message || "Implementation execution failed" },
      { status: 500 },
    );
  }
}
