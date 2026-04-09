import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { engagementId } = body;

    if (!engagementId) {
      return NextResponse.json(
        { error: "engagementId is required" },
        { status: 400 }
      );
    }

    const engagement = await prisma.engagement.findUnique({
      where: { id: engagementId },
      select: { id: true },
    });

    if (!engagement) {
      return NextResponse.json(
        { error: "Engagement not found" },
        { status: 404 }
      );
    }

    const call = await prisma.discoveryCall.update({
      where: { id: params.id },
      data: { engagementId },
    });

    return NextResponse.json(call);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to assign call" },
      { status: 500 }
    );
  }
}
