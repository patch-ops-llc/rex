import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { workstream, description, allocatedHours, rateTier, hourlyRate } = body;

    if (!workstream || allocatedHours === undefined) {
      return NextResponse.json(
        { error: "workstream and allocatedHours are required" },
        { status: 400 }
      );
    }

    const sow = await prisma.sOW.findUnique({
      where: { engagementId: params.id },
      include: { lineItems: true },
    });

    if (!sow) {
      return NextResponse.json(
        { error: "No SOW exists for this engagement" },
        { status: 404 }
      );
    }

    const lineItem = await prisma.sOWLineItem.create({
      data: {
        sowId: sow.id,
        workstream,
        description: description || null,
        allocatedHours,
        rateTier: rateTier || "TIER_1",
        hourlyRate: hourlyRate || 100,
        displayOrder: sow.lineItems.length,
      },
    });

    return NextResponse.json(lineItem, { status: 201 });
  } catch (error) {
    console.error("Failed to create line item:", error);
    return NextResponse.json(
      { error: "Failed to create line item" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { lineItemId, ...updates } = body;

    if (!lineItemId) {
      return NextResponse.json(
        { error: "lineItemId is required" },
        { status: 400 }
      );
    }

    const lineItem = await prisma.sOWLineItem.update({
      where: { id: lineItemId },
      data: {
        ...(updates.workstream !== undefined && { workstream: updates.workstream }),
        ...(updates.description !== undefined && { description: updates.description }),
        ...(updates.allocatedHours !== undefined && { allocatedHours: updates.allocatedHours }),
        ...(updates.consumedHours !== undefined && { consumedHours: updates.consumedHours }),
        ...(updates.rateTier !== undefined && { rateTier: updates.rateTier }),
        ...(updates.hourlyRate !== undefined && { hourlyRate: updates.hourlyRate }),
        ...(updates.displayOrder !== undefined && { displayOrder: updates.displayOrder }),
      },
    });

    return NextResponse.json(lineItem);
  } catch (error) {
    console.error("Failed to update line item:", error);
    return NextResponse.json(
      { error: "Failed to update line item" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const lineItemId = searchParams.get("lineItemId");

    if (!lineItemId) {
      return NextResponse.json(
        { error: "lineItemId query param is required" },
        { status: 400 }
      );
    }

    await prisma.sOWLineItem.delete({ where: { id: lineItemId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete line item:", error);
    return NextResponse.json(
      { error: "Failed to delete line item" },
      { status: 500 }
    );
  }
}
