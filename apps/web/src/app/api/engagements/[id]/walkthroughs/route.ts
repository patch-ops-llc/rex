import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";
import { compileWalkthrough } from "@rex/enablement";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const walkthroughs = await prisma.walkthrough.findMany({
      where: { engagementId: params.id },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { steps: true } },
      },
    });

    return NextResponse.json(walkthroughs);
  } catch (error) {
    console.error("Failed to fetch walkthroughs:", error);
    return NextResponse.json(
      { error: "Failed to fetch walkthroughs" },
      { status: 500 }
    );
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const engagement = await prisma.engagement.findUnique({
      where: { id: params.id },
      select: { id: true, buildPlan: { select: { id: true } } },
    });

    if (!engagement) {
      return NextResponse.json(
        { error: "Engagement not found" },
        { status: 404 }
      );
    }

    if (!engagement.buildPlan) {
      return NextResponse.json(
        { error: "No build plan found. Generate a build plan before creating a walkthrough." },
        { status: 400 }
      );
    }

    const walkthroughId = await compileWalkthrough({
      engagementId: params.id,
    });

    const walkthrough = await prisma.walkthrough.findUnique({
      where: { id: walkthroughId },
      include: {
        _count: { select: { steps: true } },
      },
    });

    return NextResponse.json(walkthrough, { status: 201 });
  } catch (error) {
    console.error("Failed to generate walkthrough:", error);
    return NextResponse.json(
      { error: "Failed to generate walkthrough" },
      { status: 500 }
    );
  }
}
