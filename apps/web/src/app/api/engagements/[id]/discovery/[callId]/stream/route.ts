import { NextRequest } from "next/server";
import { prisma, createRedisSubscriber, callChannel } from "@rex/shared";
import type { CallEvent } from "@rex/shared";
import { getBot, getBotCurrentStatus } from "@/lib/recall";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POLL_FAST_MS = 1000;
const POLL_SLOW_MS = 10000;
const RECALL_POLL_INTERVAL_MS = 10000;

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string; callId: string } }
) {
  const call = await prisma.discoveryCall.findUnique({
    where: { id: params.callId },
    select: {
      id: true,
      engagementId: true,
      status: true,
      recallBotId: true,
      startedAt: true,
      summary: true,
      duration: true,
      structuredData: true,
    },
  });

  if (!call || call.engagementId !== params.id) {
    return new Response("Not found", { status: 404 });
  }

  const encoder = new TextEncoder();
  let fallbackPoll: ReturnType<typeof setInterval> | null = null;
  let recallPoll: ReturnType<typeof setInterval> | null = null;
  let redisSub: ReturnType<typeof createRedisSubscriber> = null;
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

      const [segments, insights, agendaItems] = await Promise.all([
        prisma.transcriptSegment.findMany({
          where: { discoveryCallId: params.callId },
          orderBy: { startTime: "asc" },
        }),
        prisma.callInsight.findMany({
          where: { discoveryCallId: params.callId },
          orderBy: { createdAt: "asc" },
        }),
        prisma.callAgendaItem.findMany({
          where: { discoveryCallId: params.callId },
          orderBy: { displayOrder: "asc" },
        }),
      ]);

      const mapAgendaItem = (a: typeof agendaItems[number]) => ({
        id: a.id,
        title: a.title,
        description: a.description,
        status: a.status,
        displayOrder: a.displayOrder,
        notes: a.notes,
        resolvedAt: a.resolvedAt?.toISOString() || null,
        relatedInsights: a.relatedInsights,
      });

      const initPayload: Record<string, unknown> = {
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
        agendaItems: agendaItems.map(mapAgendaItem),
      };

      if (call.status === "COMPLETED" && call.structuredData) {
        initPayload.finalizedData = {
          summary: call.summary || null,
          insightCounts: {
            total: insights.length,
            requirements: insights.filter((i) => i.type === "REQUIREMENT").length,
            actionItems: insights.filter((i) => i.type === "ACTION_ITEM").length,
            decisions: insights.filter((i) => i.type === "DECISION").length,
            scopeConcerns: insights.filter((i) => i.type === "SCOPE_CONCERN").length,
            openQuestions: insights.filter((i) => i.type === "OPEN_QUESTION").length,
          },
          duration: call.duration || null,
          segmentCount: segments.filter((s) => s.isFinal).length,
        };
      }

      send("init", initPayload);

      const knownSegmentIds = new Set(segments.map((s) => s.id));
      const knownInsightIds = new Set(insights.map((i) => i.id));
      const agendaVersions = new Map(
        agendaItems.map((a) => [a.id, `${a.status}|${a.updatedAt.getTime()}`])
      );
      let lastStatus = call.status;

      // --- Redis subscription for instant push ---
      const channel = callChannel(params.callId);
      redisSub = createRedisSubscriber();
      let redisConnected = false;

      if (redisSub) {
        redisSub.subscribe(channel).then(() => { redisConnected = true; }).catch(() => {});

        redisSub.on("message", (_ch: string, message: string) => {
          if (closed) return;
          try {
            const event: CallEvent = JSON.parse(message);

            if (event.type === "transcript") {
              const { segment } = event.data as any;
              if (segment?.id) {
                knownSegmentIds.add(segment.id);
                send("transcript", { segment });
              }
            } else if (event.type === "insight") {
              const { insight } = event.data as any;
              if (insight?.id) {
                knownInsightIds.add(insight.id);
                send("insight", { insight });
              }
            } else if (event.type === "agenda") {
              const { item } = event.data as any;
              if (item?.id) {
                agendaVersions.set(item.id, `${item.status}|${Date.now()}`);
                send("agenda", { item });
              }
            } else if (event.type === "suggestion") {
              const { suggestion } = event.data as any;
              if (suggestion) {
                send("suggestion", { suggestion });
              }
            } else if (event.type === "voice") {
              send("voice", event.data);
            } else if (event.type === "status") {
              const { status } = event.data as any;
              if (status && status !== lastStatus) {
                lastStatus = status;
                send("status", { status });
              }
            } else if (event.type === "processing") {
              send("processing", event.data);
            } else if (event.type === "call_ended") {
              send("call_ended", event.data);
            }
          } catch {
            // Malformed message — ignore
          }
        });
      }

      // --- DB poll: fast (1s) without Redis, slow (10s) as safety net with Redis ---
      const pollMs = redisConnected ? POLL_SLOW_MS : POLL_FAST_MS;
      fallbackPoll = setInterval(async () => {
        if (closed) {
          if (fallbackPoll) clearInterval(fallbackPoll);
          return;
        }

        try {
          const [newSegments, newInsights, currentCall, currentAgenda] = await Promise.all([
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
            prisma.callAgendaItem.findMany({
              where: { discoveryCallId: params.callId },
              orderBy: { displayOrder: "asc" },
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

          for (const a of currentAgenda) {
            const version = `${a.status}|${a.updatedAt.getTime()}`;
            if (agendaVersions.get(a.id) !== version) {
              agendaVersions.set(a.id, version);
              send("agenda", { item: mapAgendaItem(a) });
            }
          }

          if (currentCall && currentCall.status !== lastStatus) {
            lastStatus = currentCall.status;
            send("status", { status: lastStatus });
          }

          if (lastStatus === "COMPLETED" || lastStatus === "FAILED") {
            if (recallPoll) clearInterval(recallPoll);
          }

          if (lastStatus === "FAILED") {
            if (fallbackPoll) clearInterval(fallbackPoll);
          }
        } catch (err) {
          console.error("Stream fallback poll error:", err);
        }
      }, pollMs);

      // --- Recall bot status sync ---
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
            const bot = await getBot(call.recallBotId!);
            const recallStatus = getBotCurrentStatus(bot);

            const statusMap: Record<string, string> = {
              joining_call: "WAITING",
              in_waiting_room: "WAITING",
              in_call_not_recording: "IN_PROGRESS",
              in_call_recording: "IN_PROGRESS",
              call_ended: "COMPLETED",
              done: "COMPLETED",
              fatal: "FAILED",
            };

            const mappedStatus = statusMap[recallStatus];
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
      if (fallbackPoll) clearInterval(fallbackPoll);
      if (recallPoll) clearInterval(recallPoll);
      if (redisSub) {
        redisSub.unsubscribe().catch(() => {});
        redisSub.quit().catch(() => {});
        redisSub = null;
      }
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
