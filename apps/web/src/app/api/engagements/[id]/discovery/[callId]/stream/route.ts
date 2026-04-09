import { NextRequest } from "next/server";
import { prisma, createRedisSubscriber } from "@rex/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string; callId: string } }
) {
  const call = await prisma.discoveryCall.findUnique({
    where: { id: params.callId },
    select: { id: true, engagementId: true, status: true },
  });

  if (!call || call.engagementId !== params.id) {
    return new Response("Not found", { status: 404 });
  }

  const encoder = new TextEncoder();
  let subscriber: ReturnType<typeof createRedisSubscriber> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // Stream closed
        }
      };

      // Send existing data as initial state
      const [segments, insights] = await Promise.all([
        prisma.transcriptSegment.findMany({
          where: { discoveryCallId: params.callId },
          orderBy: { startTime: "asc" },
        }),
        prisma.callInsight.findMany({
          where: { discoveryCallId: params.callId },
          orderBy: { createdAt: "asc" },
        }),
      ]);

      send("init", {
        status: call.status,
        segments: segments.map((s) => ({
          id: s.id,
          speaker: s.speaker,
          text: s.text,
          startTime: s.startTime,
          endTime: s.endTime,
          isFinal: s.isFinal,
        })),
        insights: insights.map((i) => ({
          id: i.id,
          type: i.type,
          content: i.content,
          speaker: i.speaker,
          timestamp: i.timestamp,
          confidence: i.confidence,
          metadata: i.metadata,
        })),
      });

      // Subscribe to Redis for real-time updates (if available)
      try {
        const sub = createRedisSubscriber();
        if (sub) {
          subscriber = sub;
          const channel = `rex:call:${params.callId}:events`;

          subscriber.subscribe(channel);
          subscriber.on("message", (_ch: string, message: string) => {
            try {
              const parsed = JSON.parse(message);
              send(parsed.type || "message", parsed);
            } catch {
              send("message", { raw: message });
            }
          });
        }
      } catch {
        // Redis unavailable — fall back to polling via heartbeat
      }

      // Heartbeat to keep connection alive
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          if (heartbeat) clearInterval(heartbeat);
        }
      }, 15000);
    },

    cancel() {
      if (subscriber) {
        subscriber.unsubscribe();
        subscriber.disconnect();
      }
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
