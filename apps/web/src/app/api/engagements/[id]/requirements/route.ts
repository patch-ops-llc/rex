import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const items = await prisma.requirementItem.findMany({
      where: { engagementId: params.id },
      orderBy: [{ category: "asc" }, { displayOrder: "asc" }],
    });
    return NextResponse.json(items);
  } catch (error) {
    console.error("Failed to fetch requirements:", error);
    return NextResponse.json(
      { error: "Failed to fetch requirements" },
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
        prisma.requirementItem.create({
          data: {
            engagementId: params.id,
            category: item.category || "General",
            question: item.question,
            context: item.context || null,
            priority: item.priority || "MEDIUM",
            sowLineItemId: item.sowLineItemId || null,
            displayOrder: item.displayOrder ?? idx,
          },
        })
      )
    );

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("Failed to create requirements:", error);
    return NextResponse.json(
      { error: "Failed to create requirements" },
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
    const { itemId, answer, answeredBy, status } = body;

    if (!itemId) {
      return NextResponse.json(
        { error: "itemId is required" },
        { status: 400 }
      );
    }

    const item = await prisma.requirementItem.update({
      where: { id: itemId },
      data: {
        ...(answer !== undefined && { answer, answeredAt: new Date() }),
        ...(answeredBy !== undefined && { answeredBy }),
        ...(status !== undefined && { status }),
      },
    });

    return NextResponse.json(item);
  } catch (error) {
    console.error("Failed to update requirement:", error);
    return NextResponse.json(
      { error: "Failed to update requirement" },
      { status: 500 }
    );
  }
}
