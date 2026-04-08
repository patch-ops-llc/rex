import { prisma, log } from "@rex/shared";
import { createHubSpotSession, closeHubSpotSession } from "./hubspot-auth";
import { buildNavigationTargets } from "./navigator";
import { captureScreenshots } from "./capturer";
import { saveAllScreenshots } from "./storage";

export interface CaptureWalkthroughOptions {
  walkthroughId: string;
}

/**
 * Phase B capture flow: Opens a Playwright browser, authenticates with
 * the engagement's linked HubSpot portal, navigates to each implemented
 * artifact, takes screenshots, and attaches them to existing walkthrough steps.
 *
 * Prerequisites:
 * - The walkthrough must exist with status READY (already has narration)
 * - The engagement must have a linked HubSpot portal with a valid access token
 * - Implementation steps must exist with hubspotResponse containing IDs
 */
export async function captureWalkthroughScreenshots(
  options: CaptureWalkthroughOptions
): Promise<void> {
  const { walkthroughId } = options;

  const walkthrough = await prisma.walkthrough.findUnique({
    where: { id: walkthroughId },
    include: {
      steps: { orderBy: { stepOrder: "asc" } },
      engagement: {
        include: {
          hubspotPortals: true,
          implementations: { orderBy: { stepOrder: "asc" } },
        },
      },
    },
  });

  if (!walkthrough) {
    throw new Error(`Walkthrough ${walkthroughId} not found`);
  }

  const portal = walkthrough.engagement.hubspotPortals?.find((p) => p.isActive) ?? null;
  if (!portal) {
    log({
      level: "warn",
      message: "No active HubSpot portal linked — skipping screenshot capture",
      service: "enablement",
      engagementId: walkthrough.engagementId,
    });
    return;
  }

  await prisma.walkthrough.update({
    where: { id: walkthroughId },
    data: { status: "CAPTURING" },
  });

  let session;
  try {
    session = await createHubSpotSession(portal.accessToken, portal.portalId);

    const implementations = walkthrough.engagement.implementations.map((impl) => ({
      stepType: impl.stepType,
      stepName: impl.stepName,
      config: impl.config as Record<string, unknown>,
      hubspotResponse: impl.hubspotResponse as Record<string, unknown> | null,
    }));

    const targets = buildNavigationTargets(portal.portalId, implementations);

    if (targets.length === 0) {
      log({
        level: "info",
        message: "No navigable targets found — skipping capture",
        service: "enablement",
        engagementId: walkthrough.engagementId,
      });
      await prisma.walkthrough.update({
        where: { id: walkthroughId },
        data: { status: "READY" },
      });
      return;
    }

    const captureResults = await captureScreenshots(session.context, targets);

    const screenshotData = captureResults.map((result, i) => ({
      stepOrder: i,
      buffer: result.screenshot,
    }));

    const urlMap = await saveAllScreenshots(walkthroughId, screenshotData);

    // Attach screenshots to matching walkthrough steps
    for (const step of walkthrough.steps) {
      const screenshotUrl = urlMap.get(step.stepOrder);
      if (screenshotUrl) {
        await prisma.walkthroughStep.update({
          where: { id: step.id },
          data: { screenshotUrl },
        });
      }
    }

    await prisma.walkthrough.update({
      where: { id: walkthroughId },
      data: { status: "READY" },
    });

    log({
      level: "info",
      message: `Captured ${captureResults.length} screenshots for walkthrough ${walkthroughId}`,
      service: "enablement",
      engagementId: walkthrough.engagementId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.walkthrough.update({
      where: { id: walkthroughId },
      data: { status: "READY" },
    });
    log({
      level: "error",
      message: `Screenshot capture failed: ${message}`,
      service: "enablement",
      engagementId: walkthrough.engagementId,
    });
  } finally {
    if (session) {
      await closeHubSpotSession(session);
    }
  }
}

export { buildNavigationTargets } from "./navigator";
export { createHubSpotSession, closeHubSpotSession } from "./hubspot-auth";
export { captureScreenshots } from "./capturer";
export { saveScreenshot, saveAllScreenshots } from "./storage";
