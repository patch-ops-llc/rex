import { NextRequest } from "next/server";
import { prisma } from "@rex/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POLL_INTERVAL_MS = 3000;
const RECALL_POLL_INTERVAL_MS = 10000;

const RECALL_API_BASE =
  (process.env.RECALL_API_URL || "https://us-east-1.recall.ai") + "/api/v1";

async function fetchRecallBot(botId: string) {
  const key = process.env.RECALL_API_KEY;
  if (!key) return null;

  try {
    const res = await fetch(`${RECALL_API_BASE}/bot/${botId}`, {
      headers: { Authorization: `Token ${key}`, "Content-Type": "application/json" },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function getRecallCurrentStatus(bot: any): string | null {
  const changes = bot?.status_changes;
  if (!Array.isArray(changes) || changes.length === 0) return null;
  return changes[changes.length - 1].code;
}

const RECALL_STATUS_MAP: Record<string, string> = {
  joining_call: "WAITING",
  in_waiting_room: "WAITING",
  in_call_not_recording: "IN_PROGRESS",
  in_call_recording: "IN_PROGRESS",
  call_ended: "COMPLETED",
  done: "COMPLETED",
  fatal: "FAILED",
};

export async function GET(
  _request: NextRequest,
  { params }: { params: { callId: string } }
) {
  const call = await prisma.discoveryCall.findUnique({
    where: { id: params.callId },
    include: {
      engagement: {
        select: { name: true, clientName: true },
      },
    },
  });

  if (!call) {
    return new Response("Not found", { status: 404 });
  }

  const encoder = new TextEncoder();
  let poll: ReturnType<typeof setInterval> | null = null;
  let recallPoll: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          closed = true;
        }
      };

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
        callTitle: call.title || "Discovery Call",
        clientName: call.engagement?.clientName || "",
        engagementName: call.engagement?.name || "",
        startedAt: call.startedAt?.toISOString() || null,
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

      let knownSegmentIds = new Set(segments.map((s) => s.id));
      let knownInsightIds = new Set(insights.map((i) => i.id));
      let lastStatus = call.status;

      poll = setInterval(async () => {
        if (closed) {
          if (poll) clearInterval(poll);
          return;
        }

        try {
          const [newSegments, newInsights, currentCall] = await Promise.all([
            prisma.transcriptSegment.findMany({
              where: {
                discoveryCallId: params.callId,
                id: { notIn: [...knownSegmentIds] },
              },
              orderBy: { startTime: "asc" },
            }),
            prisma.callInsight.findMany({
              where: {
                discoveryCallId: params.callId,
                id: { notIn: [...knownInsightIds] },
              },
              orderBy: { createdAt: "asc" },
            }),
            prisma.discoveryCall.findUnique({
              where: { id: params.callId },
              select: { status: true, startedAt: true },
            }),
          ]);

          for (const s of newSegments) {
            knownSegmentIds.add(s.id);
            send("transcript", {
              segment: {
                id: s.id,
                speaker: s.speaker,
                text: s.text,
                startTime: s.startTime,
                endTime: s.endTime,
                isFinal: s.isFinal,
              },
            });
          }

          for (const i of newInsights) {
            knownInsightIds.add(i.id);
            send("insight", {
              insight: {
                id: i.id,
                type: i.type,
                content: i.content,
                speaker: i.speaker,
                timestamp: i.timestamp,
                confidence: i.confidence,
                metadata: i.metadata,
              },
            });
          }

          if (currentCall && currentCall.status !== lastStatus) {
            lastStatus = currentCall.status;
            send("status", { status: lastStatus });
          }

          if (lastStatus === "COMPLETED" || lastStatus === "FAILED") {
            if (poll) clearInterval(poll);
            if (recallPoll) clearInterval(recallPoll);
          }
        } catch (err) {
          console.error("Display stream poll error:", err);
        }
      }, POLL_INTERVAL_MS);

      if (
        call.recallBotId &&
        call.status !== "COMPLETED" &&
        call.status !== "FAILED"
      ) {
        const syncBotStatus = async () => {
          if (closed) {
            if (recallPoll) clearInterval(recallPoll);
            return;
          }

          try {
            const bot = await fetchRecallBot(call.recallBotId!);
            if (!bot) return;

            const recallStatus = getRecallCurrentStatus(bot);
            if (!recallStatus) return;

            const mappedStatus = RECALL_STATUS_MAP[recallStatus];
            if (!mappedStatus) return;

            const current = await prisma.discoveryCall.findUnique({
              where: { id: params.callId },
              select: { status: true, startedAt: true },
            });

            if (current && current.status !== mappedStatus) {
              const updateData: Record<string, unknown> = {
                status: mappedStatus,
              };
              if (mappedStatus === "IN_PROGRESS" && !current.startedAt) {
                updateData.startedAt = new Date();
              }
              if (mappedStatus === "COMPLETED" || mappedStatus === "FAILED") {
                updateData.endedAt = new Date();
                if (recallPoll) clearInterval(recallPoll);
              }

              await prisma.discoveryCall.update({
                where: { id: params.callId },
                data: updateData,
              });
            }
          } catch {
            // Recall API unavailable — will retry next interval
          }
        };

        syncBotStatus();
        recallPoll = setInterval(syncBotStatus, RECALL_POLL_INTERVAL_MS);
      }
    },

    cancel() {
      closed = true;
      if (poll) clearInterval(poll);
      if (recallPoll) clearInterval(recallPoll);
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
