import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";
import {
  REVIEWABLE_PLAN_SECTIONS,
  type BuildPlanData,
  type PlanItemReviewStatus,
  type ReviewablePlanSection,
} from "@rex/shared";

const MUTABLE_STATUSES = new Set(["DRAFT", "PENDING_REVIEW", "REJECTED"]);

function isReviewableSection(value: string): value is ReviewablePlanSection {
  return (REVIEWABLE_PLAN_SECTIONS as readonly string[]).includes(value);
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const body = await request.json();
    const { section, index, status, reason } = body as {
      section: string;
      index: number;
      status: PlanItemReviewStatus;
      reason?: string;
    };

    if (!isReviewableSection(section)) {
      return NextResponse.json({ error: "Invalid plan section" }, { status: 400 });
    }
    if (!Number.isInteger(index) || index < 0) {
      return NextResponse.json({ error: "index must be a non-negative integer" }, { status: 400 });
    }
    if (!["APPROVED", "REJECTED"].includes(status)) {
      return NextResponse.json({ error: "status must be APPROVED or REJECTED" }, { status: 400 });
    }

    const engagement = await prisma.engagement.findUnique({
      where: { id: params.id },
      include: { buildPlan: true },
    });

    if (!engagement) {
      return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
    }
    if (!engagement.buildPlan) {
      return NextResponse.json({ error: "No build plan exists" }, { status: 400 });
    }
    if (!MUTABLE_STATUSES.has(engagement.buildPlan.status)) {
      return NextResponse.json(
        { error: `Build plan is ${engagement.buildPlan.status}, item review is locked` },
        { status: 400 },
      );
    }

    const planData = (engagement.buildPlan.planData ?? {}) as BuildPlanData & Record<string, any>;
    const sectionItems = Array.isArray(planData[section]) ? [...planData[section]] : [];
    if (index >= sectionItems.length) {
      return NextResponse.json({ error: "Item index out of range" }, { status: 400 });
    }

    const currentItem = sectionItems[index] ?? {};
    const nextItem = {
      ...currentItem,
      reviewStatus: status,
      ...(reason?.trim() ? { reviewReason: reason.trim() } : {}),
    };
    if (!reason?.trim() && "reviewReason" in nextItem) {
      delete (nextItem as Record<string, unknown>).reviewReason;
    }
    sectionItems[index] = nextItem;

    const nextPlanData = {
      ...planData,
      [section]: sectionItems,
    };

    await prisma.buildPlan.update({
      where: { id: engagement.buildPlan.id },
      data: { planData: nextPlanData as any },
    });

    await prisma.deliveryLogEntry.create({
      data: {
        engagementId: params.id,
        action: "BUILD_PLAN_ITEM_REVIEWED",
        phaseType: "BUILD_APPROVAL",
        actor: "user",
        description: `Marked ${section}[${index}] as ${status.toLowerCase()}`,
        metadata: {
          section,
          index,
          status,
          reason: reason?.trim() || undefined,
          buildPlanId: engagement.buildPlan.id,
        },
      },
    });

    return NextResponse.json({
      ok: true,
      section,
      index,
      status,
      item: sectionItems[index],
    });
  } catch (error: any) {
    console.error("Build plan item review failed:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update build plan item review" },
      { status: 500 },
    );
  }
}
