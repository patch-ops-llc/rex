import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { lineItemId, hours, description } = body;

    if (!lineItemId || hours === undefined) {
      return NextResponse.json(
        { error: "lineItemId and hours are required" },
        { status: 400 }
      );
    }

    const lineItem = await prisma.sOWLineItem.findUnique({
      where: { id: lineItemId },
      include: { sow: true },
    });

    if (!lineItem) {
      return NextResponse.json(
        { error: "Line item not found" },
        { status: 404 }
      );
    }

    const newConsumed = lineItem.consumedHours + hours;
    const utilization = newConsumed / lineItem.allocatedHours;

    const updated = await prisma.sOWLineItem.update({
      where: { id: lineItemId },
      data: { consumedHours: newConsumed },
    });

    // Auto-generate scope alerts based on thresholds
    if (utilization >= 1.0 && lineItem.consumedHours / lineItem.allocatedHours < 1.0) {
      await prisma.scopeAlert.create({
        data: {
          engagementId: params.id,
          type: "OVER_HOURS",
          severity: "CRITICAL",
          title: `${lineItem.workstream} has exceeded allocated hours`,
          description: `${newConsumed.toFixed(1)}h consumed of ${lineItem.allocatedHours}h allocated (${(utilization * 100).toFixed(0)}%). Additional hours are out of scope.`,
          workstream: lineItem.workstream,
          hoursImpact: newConsumed - lineItem.allocatedHours,
          budgetImpact: (newConsumed - lineItem.allocatedHours) * lineItem.hourlyRate,
          sourceId: lineItemId,
          sourceType: "SOWLineItem",
        },
      });
    } else if (utilization >= 0.8 && lineItem.consumedHours / lineItem.allocatedHours < 0.8) {
      await prisma.scopeAlert.create({
        data: {
          engagementId: params.id,
          type: "APPROACHING_LIMIT",
          severity: "WARNING",
          title: `${lineItem.workstream} approaching hour limit`,
          description: `${newConsumed.toFixed(1)}h consumed of ${lineItem.allocatedHours}h allocated (${(utilization * 100).toFixed(0)}%). ${(lineItem.allocatedHours - newConsumed).toFixed(1)}h remaining.`,
          workstream: lineItem.workstream,
          hoursImpact: null,
          budgetImpact: null,
          sourceId: lineItemId,
          sourceType: "SOWLineItem",
        },
      });
    }

    return NextResponse.json({
      lineItem: updated,
      utilization,
      alertGenerated: utilization >= 0.8 && (lineItem.consumedHours / lineItem.allocatedHours) < 0.8,
    });
  } catch (error) {
    console.error("Failed to log hours:", error);
    return NextResponse.json(
      { error: "Failed to log hours" },
      { status: 500 }
    );
  }
}
