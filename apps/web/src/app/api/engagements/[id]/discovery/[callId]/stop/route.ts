import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";
import { removeBot } from "@/lib/recall";
import { processTranscriptChunk } from "@/lib/call-processor";
import { finalizeCall } from "@/lib/call-finalizer";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string; callId: string } }
) {
  try {
    const call = await prisma.discoveryCall.findUnique({
      where: { id: params.callId },
      include: {
        segments: { orderBy: { startTime: "asc" } },
      },
    });

    if (!call || call.engagementId !== params.id) {
      return NextResponse.json(
        { error: "Discovery call not found" },
        { status: 404 }
      );
    }

    if (call.status === "COMPLETED" || call.status === "FAILED") {
      return NextResponse.json(
        { error: "Call is already ended" },
        { status: 400 }
      );
    }

    if (call.recallBotId) {
      try {
        await removeBot(call.recallBotId);
      } catch (err: any) {
        console.error("Failed to remove bot (may have already left):", err.message);
      }
    }

    const now = new Date();
    await prisma.discoveryCall.update({
      where: { id: params.callId },
      data: {
        status: "COMPLETED",
        endedAt: now,
        duration: call.startedAt
          ? Math.round((now.getTime() - call.startedAt.getTime()) / 1000)
          : null,
      },
    });

    const rawTranscript = call.segments.map((s) => ({
      speaker: s.speaker,
      text: s.text,
      startTime: s.startTime,
      endTime: s.endTime,
    }));

    if (rawTranscript.length > 0) {
      await prisma.discoveryCall.update({
        where: { id: params.callId },
        data: { rawTranscript },
      });
    }

    try {
      const result = await processTranscriptChunk(params.callId, true);
      if (result.summary) {
        await prisma.discoveryCall.update({
          where: { id: params.callId },
          data: { summary: result.summary },
        });
      }
      await finalizeCall(params.callId);
    } catch (err) {
      console.error("Final processing failed:", err);
    }

    return NextResponse.json({
      status: "COMPLETED",
      segmentCount: rawTranscript.length,
    });
  } catch (error: any) {
    console.error("Failed to stop session:", error);
    return NextResponse.json(
      { error: error.message || "Failed to stop session" },
      { status: 500 }
    );
  }
}
