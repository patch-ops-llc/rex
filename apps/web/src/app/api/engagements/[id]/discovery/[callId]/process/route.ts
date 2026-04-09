import { NextRequest, NextResponse } from "next/server";
import { prisma, getRedis } from "@rex/shared";
import { processTranscriptChunk } from "@/lib/call-processor";
import { finalizeCall } from "@/lib/call-finalizer";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; callId: string } }
) {
  try {
    const call = await prisma.discoveryCall.findUnique({
      where: { id: params.callId },
      select: { id: true, engagementId: true, status: true },
    });

    if (!call || call.engagementId !== params.id) {
      return NextResponse.json(
        { error: "Discovery call not found" },
        { status: 404 }
      );
    }

    const isFinal = request.headers.get("x-final") === "true";

    const redis = getRedis();
    if (redis) {
      try {
        await redis.publish(
          `rex:call:${call.id}:events`,
          JSON.stringify({
            type: "processing",
            stage: isFinal ? "analyzing" : "started",
          })
        );
      } catch {
        // Redis unavailable
      }
    }

    const result = await processTranscriptChunk(params.callId, isFinal);

    if (isFinal) {
      if (result.summary) {
        await prisma.discoveryCall.update({
          where: { id: params.callId },
          data: { summary: result.summary },
        });
      }

      await finalizeCall(params.callId);
    }

    return NextResponse.json({
      insightsExtracted: result.insights.length,
      summary: result.summary,
      finalized: isFinal,
    });
  } catch (error: any) {
    console.error("Processing failed:", error);
    return NextResponse.json(
      { error: error.message || "Processing failed" },
      { status: 500 }
    );
  }
}
