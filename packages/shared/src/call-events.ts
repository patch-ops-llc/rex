import { getRedis } from "./redis";

export type CallEventType = "transcript" | "insight" | "status" | "agenda" | "suggestion" | "voice" | "processing" | "call_ended";

export interface CallEvent {
  type: CallEventType;
  data: unknown;
}

export function callChannel(callId: string): string {
  return `rex:call:${callId}`;
}

export async function publishCallEvent(
  callId: string,
  event: CallEvent
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.publish(callChannel(callId), JSON.stringify(event));
  } catch {
    // Non-critical — SSE falls back to DB polling
  }
}
