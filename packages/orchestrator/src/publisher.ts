import { v4 as uuid } from "uuid";
import { getRedis, type EventType, type BaseEvent, log } from "@rex/shared";
import { REX_EVENTS_CHANNEL } from "./events";

export async function publishEvent(
  type: EventType,
  engagementId: string,
  payload: Record<string, unknown>
): Promise<string> {
  const redis = getRedis();
  const event: BaseEvent & { payload: Record<string, unknown> } = {
    id: uuid(),
    type,
    timestamp: new Date().toISOString(),
    engagementId,
    payload,
  };

  const message = JSON.stringify(event);
  if (redis) {
    await redis.publish(REX_EVENTS_CHANNEL, message);
  }

  log({
    level: "info",
    message: `Published event: ${type}`,
    service: "orchestrator",
    engagementId,
    eventType: type,
    meta: { eventId: event.id },
  });

  return event.id;
}
