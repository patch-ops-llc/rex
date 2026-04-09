import { NextRequest, NextResponse } from "next/server";
import { prisma, publishCallEvent } from "@rex/shared";
import { processTranscriptChunk } from "@/lib/call-processor";
import { finalizeCall } from "@/lib/call-finalizer";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; callId: string } }
) {
  try {
    const call = await prisma.discoveryCall.findUnique({
      where: { id: params.callId },
      select: { id: true, engagementId: true, status: true, structuredData: true },
    });

    if (!call || call.engagementId !== params.id) {
      return NextResponse.json(
        { error: "Discovery call not found" },
        { status: 404 }
      );
    }

    const isFinal = request.headers.get("x-final") === "true";

    if (isFinal && call.structuredData) {
      return NextResponse.json({
        insightsExtracted: 0,
        summary: null,
        finalized: true,
        alreadyProcessed: true,
      });
    }

    if (isFinal) {
      publishCallEvent(params.callId, {
        type: "processing",
        data: { stage: "started" },
      });
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

      const [finalInsights, finalSegmentCount, finalCall] = await Promise.all([
        prisma.callInsight.findMany({
          where: { discoveryCallId: params.callId },
          select: { type: true },
        }),
        prisma.transcriptSegment.count({
          where: { discoveryCallId: params.callId, isFinal: true },
        }),
        prisma.discoveryCall.findUnique({
          where: { id: params.callId },
          select: { summary: true, duration: true },
        }),
      ]);

      const callEndedData = {
        summary: finalCall?.summary || result.summary || null,
        insightCounts: {
          total: finalInsights.length,
          requirements: finalInsights.filter((i) => i.type === "REQUIREMENT").length,
          actionItems: finalInsights.filter((i) => i.type === "ACTION_ITEM").length,
          decisions: finalInsights.filter((i) => i.type === "DECISION").length,
          scopeConcerns: finalInsights.filter((i) => i.type === "SCOPE_CONCERN").length,
          openQuestions: finalInsights.filter((i) => i.type === "OPEN_QUESTION").length,
        },
        duration: finalCall?.duration || null,
        segmentCount: finalSegmentCount,
      };

      publishCallEvent(params.callId, {
        type: "processing",
        data: { stage: "complete" },
      });

      publishCallEvent(params.callId, {
        type: "call_ended",
        data: callEndedData,
      });
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
