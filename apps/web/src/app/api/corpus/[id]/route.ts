import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const entry = await prisma.corpusEntry.findUnique({
      where: { id: params.id },
    });

    if (!entry) {
      return NextResponse.json(
        { error: "Corpus entry not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(entry);
  } catch (error) {
    console.error("Failed to fetch corpus entry:", error);
    return NextResponse.json(
      { error: "Failed to fetch corpus entry" },
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
    const { name, tags, industry, complexity, outcome, category, source, annotations } = body;

    const entry = await prisma.corpusEntry.update({
      where: { id: params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(tags !== undefined && { tags }),
        ...(industry !== undefined && { industry }),
        ...(complexity !== undefined && { complexity }),
        ...(outcome !== undefined && { outcome }),
        ...(category !== undefined && { category }),
        ...(source !== undefined && { source }),
        ...(annotations !== undefined && { annotations }),
      },
    });

    return NextResponse.json(entry);
  } catch (error) {
    console.error("Failed to update corpus entry:", error);
    return NextResponse.json(
      { error: "Failed to update corpus entry" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.corpusEntry.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Failed to delete corpus entry:", error);
    return NextResponse.json(
      { error: "Failed to delete corpus entry" },
      { status: 500 }
    );
  }
}
