import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; callId: string } }
) {
  try {
    const call = await prisma.discoveryCall.findUnique({
      where: { id: params.callId },
      select: { id: true, engagementId: true },
    });

    if (!call || call.engagementId !== params.id) {
      return NextResponse.json(
        { error: "Discovery call not found" },
        { status: 404 }
      );
    }

    await prisma.$transaction([
      prisma.transcriptSegment.deleteMany({ where: { discoveryCallId: params.callId } }),
      prisma.callInsight.deleteMany({ where: { discoveryCallId: params.callId } }),
      prisma.discoveryCall.delete({ where: { id: params.callId } }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete discovery call:", error);
    return NextResponse.json(
      { error: "Failed to delete discovery call" },
      { status: 500 }
    );
  }
}
