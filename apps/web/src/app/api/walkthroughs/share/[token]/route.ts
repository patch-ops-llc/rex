import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";

export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const walkthrough = await prisma.walkthrough.findUnique({
      where: { shareToken: params.token },
      include: {
        steps: { orderBy: { stepOrder: "asc" } },
        engagement: {
          select: { name: true, clientName: true },
        },
      },
    });

    if (!walkthrough) {
      return NextResponse.json(
        { error: "Walkthrough not found" },
        { status: 404 }
      );
    }

    if (walkthrough.status !== "READY") {
      return NextResponse.json(
        { error: "Walkthrough is not ready yet" },
        { status: 404 }
      );
    }

    return NextResponse.json(walkthrough);
  } catch (error) {
    console.error("Failed to fetch shared walkthrough:", error);
    return NextResponse.json(
      { error: "Failed to fetch walkthrough" },
      { status: 500 }
    );
  }
}
