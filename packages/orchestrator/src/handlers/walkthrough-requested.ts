import { prisma, log, EventType } from "@rex/shared";
import type { EventHandler } from "../subscriber";
import { publishEvent } from "../publisher";

export const handleWalkthroughRequested: EventHandler = async (event) => {
  log({
    level: "info",
    message: "Processing walkthrough generation request",
    service: "orchestrator",
    engagementId: event.engagementId,
    eventType: event.type,
  });

  try {
    // Dynamic import to avoid requiring @rex/enablement at orchestrator
    // startup (keeps the enablement package optional for deployments
    // that don't run the orchestrator)
    const { compileWalkthrough } = await import("@rex/enablement");

    const walkthroughId = await compileWalkthrough({
      engagementId: event.engagementId,
    });

    await publishEvent(
      EventType.WALKTHROUGH_COMPLETE,
      event.engagementId,
      { walkthroughId }
    );

    log({
      level: "info",
      message: `Walkthrough generated: ${walkthroughId}`,
      service: "orchestrator",
      engagementId: event.engagementId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await publishEvent(
      EventType.WALKTHROUGH_FAILED,
      event.engagementId,
      { error: message }
    );

    log({
      level: "error",
      message: `Walkthrough generation failed: ${message}`,
      service: "orchestrator",
      engagementId: event.engagementId,
    });

    throw error;
  }
};
