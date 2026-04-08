import { NextRequest, NextResponse } from "next/server";
import { prisma, getRedis } from "@rex/shared";

const PROCESS_INTERVAL_SECONDS = 30;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { event, data } = body;

    if (!event || !data) {
      return NextResponse.json({ received: true });
    }

    switch (event) {
      case "bot.status_change":
        await handleStatusChange(data);
        break;

      case "transcript.data":
        await handleRealtimeTranscript(data, true);
        break;

      case "transcript.partial_data":
        await handleRealtimeTranscript(data, false);
        break;

      case "bot.transcription":
      case "transcript.realtime":
        await handleTranscription(data);
        break;

      case "bot.done":
      case "bot.media_ready":
        await handleCallDone(data);
        break;

      default:
        console.log(`Unhandled Recall webhook event: ${event}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return NextResponse.json({ received: true });
  }
}

async function handleStatusChange(data: any) {
  const { bot_id, status } = data;
  if (!bot_id) return;

  const call = await prisma.discoveryCall.findFirst({
    where: { recallBotId: bot_id },
  });
  if (!call) return;

  const statusMap: Record<string, string> = {
    joining_call: "WAITING",
    in_waiting_room: "WAITING",
    in_call_not_recording: "IN_PROGRESS",
    in_call_recording: "IN_PROGRESS",
    call_ended: "COMPLETED",
    done: "COMPLETED",
    fatal: "FAILED",
    analysis_done: "COMPLETED",
  };

  const newStatus = statusMap[status?.code || status] || null;
  if (!newStatus) return;

  const updateData: any = { status: newStatus };

  if (newStatus === "IN_PROGRESS" && !call.startedAt) {
    updateData.startedAt = new Date();
  }
  if (newStatus === "COMPLETED" && !call.endedAt) {
    updateData.endedAt = new Date();
    if (call.startedAt) {
      updateData.duration = Math.round(
        (Date.now() - call.startedAt.getTime()) / 1000
      );
    }
  }

  await prisma.discoveryCall.update({
    where: { id: call.id },
    data: updateData,
  });

  try {
    const redis = getRedis();
    await redis.publish(
      `rex:call:${call.id}:events`,
      JSON.stringify({ type: "status", status: newStatus, message: status?.message })
    );
  } catch {
    // Redis unavailable — non-fatal
  }
}

async function handleRealtimeTranscript(data: any, isFinal: boolean) {
  const botId = data?.bot?.id;
  if (!botId) return;

  const call = await prisma.discoveryCall.findFirst({
    where: { recallBotId: botId },
  });
  if (!call) return;

  const entry = data?.data;
  if (!entry?.words?.length) return;

  const text = entry.words.map((w: any) => w.text).join(" ");
  const startTime = entry.words[0]?.start_timestamp?.relative ?? 0;
  const endTime =
    entry.words[entry.words.length - 1]?.end_timestamp?.relative ?? startTime;
  const speaker = entry.participant?.name || "Unknown";

  const segment = await prisma.transcriptSegment.create({
    data: {
      discoveryCallId: call.id,
      speaker,
      text,
      startTime,
      endTime,
      confidence: 1,
      isFinal,
    },
  });

  try {
    const redis = getRedis();
    await redis.publish(
      `rex:call:${call.id}:events`,
      JSON.stringify({
        type: "transcript",
        segment: {
          id: segment.id,
          speaker: segment.speaker,
          text: segment.text,
          startTime: segment.startTime,
          endTime: segment.endTime,
          isFinal: segment.isFinal,
        },
      })
    );
  } catch {
    // Redis unavailable — non-fatal
  }

  if (!isFinal) return;

  const now = new Date();
  const lastProcessed = call.lastProcessedAt;
  const secondsSinceLastProcess = lastProcessed
    ? (now.getTime() - lastProcessed.getTime()) / 1000
    : Infinity;

  if (secondsSinceLastProcess >= PROCESS_INTERVAL_SECONDS) {
    await prisma.discoveryCall.update({
      where: { id: call.id },
      data: { lastProcessedAt: now },
    });

    const appUrl = (process.env.WEB_URL || "").replace(/\/+$/, "");
    if (appUrl) {
      fetch(
        `${appUrl}/api/engagements/${call.engagementId}/discovery/${call.id}/process`,
        { method: "POST" }
      ).catch((err) => console.error("Failed to trigger processing:", err));
    }
  }
}

async function handleTranscription(data: any) {
  const { bot_id, transcript } = data;
  if (!bot_id) return;

  const call = await prisma.discoveryCall.findFirst({
    where: { recallBotId: bot_id },
  });
  if (!call) return;

  const entries = Array.isArray(transcript) ? transcript : [transcript];
  if (!entries.length) return;

  for (const entry of entries) {
    if (!entry || !entry.words?.length) continue;

    const text = entry.words.map((w: any) => w.text).join(" ");
    const startTime = entry.words[0].start_time;
    const endTime = entry.words[entry.words.length - 1].end_time;
    const avgConfidence =
      entry.words.reduce((sum: number, w: any) => sum + (w.confidence || 1), 0) /
      entry.words.length;

    const segment = await prisma.transcriptSegment.create({
      data: {
        discoveryCallId: call.id,
        speaker: entry.speaker || "Unknown",
        text,
        startTime,
        endTime,
        confidence: avgConfidence,
        isFinal: entry.is_final ?? true,
      },
    });

    try {
      const redis = getRedis();
      await redis.publish(
        `rex:call:${call.id}:events`,
        JSON.stringify({
          type: "transcript",
          segment: {
            id: segment.id,
            speaker: segment.speaker,
            text: segment.text,
            startTime: segment.startTime,
            endTime: segment.endTime,
            isFinal: segment.isFinal,
          },
        })
      );
    } catch {
      // Redis unavailable — non-fatal
    }
  }

  // Trigger AI processing periodically
  const now = new Date();
  const lastProcessed = call.lastProcessedAt;
  const secondsSinceLastProcess = lastProcessed
    ? (now.getTime() - lastProcessed.getTime()) / 1000
    : Infinity;

  if (secondsSinceLastProcess >= PROCESS_INTERVAL_SECONDS) {
    await prisma.discoveryCall.update({
      where: { id: call.id },
      data: { lastProcessedAt: now },
    });

    const appUrl = (process.env.WEB_URL || "").replace(/\/+$/, "");
    if (appUrl) {
      fetch(
        `${appUrl}/api/engagements/${call.engagementId}/discovery/${call.id}/process`,
        { method: "POST" }
      ).catch((err) => console.error("Failed to trigger processing:", err));
    }
  }
}

async function handleCallDone(data: any) {
  const { bot_id } = data;
  if (!bot_id) return;

  const call = await prisma.discoveryCall.findFirst({
    where: { recallBotId: bot_id },
  });
  if (!call) return;

  await prisma.discoveryCall.update({
    where: { id: call.id },
    data: {
      status: "COMPLETED",
      endedAt: call.endedAt || new Date(),
      duration:
        call.duration ||
        (call.startedAt
          ? Math.round((Date.now() - call.startedAt.getTime()) / 1000)
          : null),
    },
  });

  // Build full transcript from segments
  const segments = await prisma.transcriptSegment.findMany({
    where: { discoveryCallId: call.id },
    orderBy: { startTime: "asc" },
  });

  const rawTranscript = segments.map((s) => ({
    speaker: s.speaker,
    text: s.text,
    startTime: s.startTime,
    endTime: s.endTime,
  }));

  await prisma.discoveryCall.update({
    where: { id: call.id },
    data: { rawTranscript },
  });

  const appUrl = (process.env.WEB_URL || "").replace(/\/+$/, "");
  if (appUrl) {
    fetch(
      `${appUrl}/api/engagements/${call.engagementId}/discovery/${call.id}/process`,
      { method: "POST", headers: { "x-final": "true" } }
    ).catch((err) => console.error("Failed to trigger final processing:", err));
  }

  try {
    const redis = getRedis();
    await redis.publish(
      `rex:call:${call.id}:events`,
      JSON.stringify({ type: "status", status: "COMPLETED", message: "Call ended" })
    );
  } catch {
    // Redis unavailable
  }
}
