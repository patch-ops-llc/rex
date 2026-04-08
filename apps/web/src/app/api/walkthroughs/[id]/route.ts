import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const walkthrough = await prisma.walkthrough.findUnique({
      where: { id: params.id },
      include: {
        steps: { orderBy: { stepOrder: "asc" } },
        engagement: {
          select: { id: true, name: true, clientName: true },
        },
      },
    });

    if (!walkthrough) {
      return NextResponse.json(
        { error: "Walkthrough not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(walkthrough);
  } catch (error) {
    console.error("Failed to fetch walkthrough:", error);
    return NextResponse.json(
      { error: "Failed to fetch walkthrough" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.walkthrough.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete walkthrough:", error);
    return NextResponse.json(
      { error: "Failed to delete walkthrough" },
      { status: 500 }
    );
  }
}
