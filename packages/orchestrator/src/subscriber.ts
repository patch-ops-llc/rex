import { createRedisSubscriber, type EventType, log } from "@rex/shared";
import { REX_EVENTS_CHANNEL } from "./events";
import { pushToDeadLetter } from "./dead-letter";

export type EventHandler = (event: {
  id: string;
  type: EventType;
  timestamp: string;
  engagementId: string;
  payload: Record<string, unknown>;
}) => Promise<void>;

const handlerRegistry = new Map<EventType, EventHandler[]>();

export function registerHandler(
  eventType: EventType,
  handler: EventHandler
): void {
  const existing = handlerRegistry.get(eventType) ?? [];
  existing.push(handler);
  handlerRegistry.set(eventType, existing);

  log({
    level: "info",
    message: `Registered handler for ${eventType}`,
    service: "orchestrator",
  });
}

export async function startSubscriber(): Promise<void> {
  const subscriber = createRedisSubscriber();
  if (!subscriber) {
    log({ level: "error", message: "Redis unavailable — subscriber not started", service: "orchestrator" });
    return;
  }

  subscriber.subscribe(REX_EVENTS_CHANNEL, (err) => {
    if (err) {
      log({
        level: "error",
        message: `Failed to subscribe to ${REX_EVENTS_CHANNEL}`,
        service: "orchestrator",
        meta: { error: err.message },
      });
      throw err;
    }
    log({
      level: "info",
      message: `Subscribed to ${REX_EVENTS_CHANNEL}`,
      service: "orchestrator",
    });
  });

  subscriber.on("message", async (_channel, message) => {
    let parsed: {
      id: string;
      type: EventType;
      timestamp: string;
      engagementId: string;
      payload: Record<string, unknown>;
    };

    try {
      parsed = JSON.parse(message);
    } catch {
      log({
        level: "error",
        message: "Failed to parse event message",
        service: "orchestrator",
        meta: { raw: message },
      });
      return;
    }

    const handlers = handlerRegistry.get(parsed.type) ?? [];

    if (handlers.length === 0) {
      log({
        level: "warn",
        message: `No handlers for event type: ${parsed.type}`,
        service: "orchestrator",
        eventType: parsed.type,
      });
      return;
    }

    for (const handler of handlers) {
      try {
        await handler(parsed);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : String(err);
        log({
          level: "error",
          message: `Handler failed for ${parsed.type}`,
          service: "orchestrator",
          engagementId: parsed.engagementId,
          eventType: parsed.type,
          meta: { error: errorMessage, eventId: parsed.id },
        });

        await pushToDeadLetter({
          event: message,
          error: errorMessage,
          handler: handler.name || "anonymous",
          failedAt: new Date().toISOString(),
          retryCount: 0,
        });
      }
    }
  });
}
