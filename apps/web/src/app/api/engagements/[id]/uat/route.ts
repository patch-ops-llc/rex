import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const items = await prisma.uATItem.findMany({
      where: { engagementId: params.id },
      orderBy: [{ category: "asc" }, { displayOrder: "asc" }],
    });
    return NextResponse.json(items);
  } catch (error) {
    console.error("Failed to fetch UAT items:", error);
    return NextResponse.json(
      { error: "Failed to fetch UAT items" },
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

    // Support bulk creation (from AI generation) or single
    const items = Array.isArray(body) ? body : [body];

    const created = await prisma.$transaction(
      items.map((item: any, idx: number) =>
        prisma.uATItem.create({
          data: {
            engagementId: params.id,
            category: item.category || "General",
            title: item.title,
            description: item.description,
            testSteps: item.testSteps || null,
            expectedResult: item.expectedResult || null,
            linkedStepId: item.linkedStepId || null,
            displayOrder: item.displayOrder ?? idx,
          },
        })
      )
    );

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("Failed to create UAT items:", error);
    return NextResponse.json(
      { error: "Failed to create UAT items" },
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
    const { itemId, status, testedBy, clientNotes } = body;

    if (!itemId) {
      return NextResponse.json(
        { error: "itemId is required" },
        { status: 400 }
      );
    }

    const item = await prisma.uATItem.update({
      where: { id: itemId },
      data: {
        ...(status !== undefined && { status }),
        ...(testedBy !== undefined && { testedBy }),
        ...(clientNotes !== undefined && { clientNotes }),
        ...(status && status !== "NOT_TESTED" && { testedAt: new Date() }),
      },
    });

    return NextResponse.json(item);
  } catch (error) {
    console.error("Failed to update UAT item:", error);
    return NextResponse.json(
      { error: "Failed to update UAT item" },
      { status: 500 }
    );
  }
}
