import { log, EventType } from "@rex/shared";
import { startSubscriber, registerHandler } from "./subscriber";
import { handleDiscoverySubmitted } from "./handlers/discovery-submitted";
import { handleWalkthroughRequested } from "./handlers/walkthrough-requested";

async function main() {
  log({
    level: "info",
    message: "Starting Rex Orchestrator",
    service: "orchestrator",
  });

  registerHandler(
    EventType.DISCOVERY_DATA_SUBMITTED,
    handleDiscoverySubmitted
  );

  registerHandler(
    EventType.WALKTHROUGH_REQUESTED,
    handleWalkthroughRequested
  );

  await startSubscriber();

  log({
    level: "info",
    message: "Rex Orchestrator is running",
    service: "orchestrator",
  });
}

main().catch((err) => {
  log({
    level: "error",
    message: `Orchestrator failed to start: ${err.message}`,
    service: "orchestrator",
    meta: { error: err.stack },
  });
  process.exit(1);
});
