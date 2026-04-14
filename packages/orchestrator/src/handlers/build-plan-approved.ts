import { log } from "@rex/shared";
import type { EventHandler } from "../subscriber";

export const handleBuildPlanApproved: EventHandler = async (event) => {
  log({
    level: "info",
    message: "Build plan approved — implementation can be triggered",
    service: "orchestrator",
    engagementId: event.engagementId,
    eventType: event.type,
    meta: { buildPlanId: event.payload.buildPlanId },
  });

  // The engine is invoked via the web API route (POST /api/engagements/:id/implement)
  // rather than auto-executing here, because implementation should be explicitly
  // triggered after portal access is confirmed. This handler logs the approval
  // and could be extended to send notifications (Slack, email) prompting the
  // team to kick off execution.
};
