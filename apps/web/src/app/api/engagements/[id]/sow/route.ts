import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sow = await prisma.sOW.findUnique({
      where: { engagementId: params.id },
      include: {
        lineItems: { orderBy: { displayOrder: "asc" } },
      },
    });

    if (!sow) {
      return NextResponse.json(null);
    }

    const totals = {
      allocatedHours: sow.lineItems.reduce(
        (sum, li) => sum + li.allocatedHours,
        0
      ),
      consumedHours: sow.lineItems.reduce(
        (sum, li) => sum + li.consumedHours,
        0
      ),
      allocatedBudget: sow.lineItems.reduce(
        (sum, li) => sum + li.allocatedHours * li.hourlyRate,
        0
      ),
      consumedBudget: sow.lineItems.reduce(
        (sum, li) => sum + li.consumedHours * li.hourlyRate,
        0
      ),
    };

    return NextResponse.json({ ...sow, totals });
  } catch (error) {
    console.error("Failed to fetch SOW:", error);
    return NextResponse.json(
      { error: "Failed to fetch SOW" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { title, totalBudget, totalHours, startDate, endDate, notes, lineItems } = body;

    if (!title) {
      return NextResponse.json(
        { error: "title is required" },
        { status: 400 }
      );
    }

    const existing = await prisma.sOW.findUnique({
      where: { engagementId: params.id },
    });

    if (existing) {
      return NextResponse.json(
        { error: "SOW already exists for this engagement. Use PATCH to update." },
        { status: 409 }
      );
    }

    const sow = await prisma.sOW.create({
      data: {
        engagementId: params.id,
        title,
        totalBudget: totalBudget || null,
        totalHours: totalHours || null,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        notes: notes || null,
        lineItems: lineItems?.length
          ? {
              create: lineItems.map((li: any, idx: number) => ({
                workstream: li.workstream,
                description: li.description || null,
                allocatedHours: li.allocatedHours,
                rateTier: li.rateTier || "TIER_1",
                hourlyRate: li.hourlyRate || 100,
                displayOrder: idx,
              })),
            }
          : undefined,
      },
      include: {
        lineItems: { orderBy: { displayOrder: "asc" } },
      },
    });

    return NextResponse.json(sow, { status: 201 });
  } catch (error) {
    console.error("Failed to create SOW:", error);
    return NextResponse.json(
      { error: "Failed to create SOW" },
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
    const { title, status, totalBudget, totalHours, startDate, endDate, notes } = body;

    const sow = await prisma.sOW.update({
      where: { engagementId: params.id },
      data: {
        ...(title !== undefined && { title }),
        ...(status !== undefined && { status }),
        ...(totalBudget !== undefined && { totalBudget }),
        ...(totalHours !== undefined && { totalHours }),
        ...(startDate !== undefined && {
          startDate: startDate ? new Date(startDate) : null,
        }),
        ...(endDate !== undefined && {
          endDate: endDate ? new Date(endDate) : null,
        }),
        ...(notes !== undefined && { notes }),
      },
      include: {
        lineItems: { orderBy: { displayOrder: "asc" } },
      },
    });

    return NextResponse.json(sow);
  } catch (error) {
    console.error("Failed to update SOW:", error);
    return NextResponse.json(
      { error: "Failed to update SOW" },
      { status: 500 }
    );
  }
}
