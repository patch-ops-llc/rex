import type { BrowserContext } from "playwright";
import { log } from "@rex/shared";
import type { NavigationTarget } from "./navigator";

export interface CaptureResult {
  target: NavigationTarget;
  screenshot: Buffer;
  pageTitle: string;
  finalUrl: string;
}

export async function captureScreenshots(
  context: BrowserContext,
  targets: NavigationTarget[],
  onProgress?: (completed: number, total: number) => void
): Promise<CaptureResult[]> {
  const results: CaptureResult[] = [];
  const page = await context.newPage();

  try {
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];

      try {
        log({
          level: "info",
          message: `Capturing screenshot ${i + 1}/${targets.length}: ${target.label}`,
          service: "enablement",
        });

        await page.goto(target.url, {
          waitUntil: "networkidle",
          timeout: 30000,
        });

        if (target.waitSelector) {
          await page
            .waitForSelector(target.waitSelector, { timeout: 10000 })
            .catch(() => {
              // Selector not found — proceed with screenshot anyway
            });
        }

        // Brief pause for any animations/transitions
        await page.waitForTimeout(1500);

        if (target.scrollToSelector) {
          await page
            .locator(target.scrollToSelector)
            .scrollIntoViewIfNeeded()
            .catch(() => {});
        }

        // Dismiss any HubSpot modals/tooltips that might overlay content
        await dismissOverlays(page);

        const screenshot = await page.screenshot({
          fullPage: false,
          type: "png",
        });

        results.push({
          target,
          screenshot,
          pageTitle: await page.title(),
          finalUrl: page.url(),
        });

        onProgress?.(i + 1, targets.length);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log({
          level: "warn",
          message: `Failed to capture ${target.label}: ${message}`,
          service: "enablement",
        });
      }
    }
  } finally {
    await page.close();
  }

  return results;
}

async function dismissOverlays(page: import("playwright").Page): Promise<void> {
  const dismissSelectors = [
    "[data-test-id='modal-close-button']",
    "[data-test-id='guided-tour-close']",
    ".shepherd-cancel-icon",
    "[aria-label='Close']",
    "[data-test-id='onboarding-dismiss']",
  ];

  for (const selector of dismissSelectors) {
    try {
      const el = page.locator(selector).first();
      if (await el.isVisible({ timeout: 500 })) {
        await el.click();
        await page.waitForTimeout(300);
      }
    } catch {
      // No overlay to dismiss
    }
  }
}
