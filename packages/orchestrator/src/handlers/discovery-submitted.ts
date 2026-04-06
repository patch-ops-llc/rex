import { prisma, log, EngagementStatus, EventType } from "@rex/shared";
import type { EventHandler } from "../subscriber";

export const handleDiscoverySubmitted: EventHandler = async (event) => {
  log({
    level: "info",
    message: "Processing discovery data submission",
    service: "orchestrator",
    engagementId: event.engagementId,
    eventType: event.type,
  });

  await prisma.engagement.update({
    where: { id: event.engagementId },
    data: { status: EngagementStatus.PLAN_GENERATION },
  });

  log({
    level: "info",
    message: "Engagement transitioned to PLAN_GENERATION",
    service: "orchestrator",
    engagementId: event.engagementId,
  });

  // TODO (Phase 2): trigger build plan generation via Claude API
};
