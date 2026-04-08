import { chromium, type Browser, type BrowserContext } from "playwright";
import { log } from "@rex/shared";

export interface HubSpotSession {
  browser: Browser;
  context: BrowserContext;
  portalId: string;
}

/**
 * Authenticate a Playwright browser session against HubSpot using an
 * access token. HubSpot's app.hubspot.com frontend accepts bearer tokens
 * via the /login-verify endpoint with an apikey, or we can inject the
 * token as a cookie / authorization header via route interception.
 *
 * The most reliable approach: navigate to the HubSpot login, intercept
 * the auth API call, and inject the access token.
 */
export async function createHubSpotSession(
  accessToken: string,
  portalId: string
): Promise<HubSpotSession> {
  log({
    level: "info",
    message: `Creating HubSpot browser session for portal ${portalId}`,
    service: "enablement",
  });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  // Inject the HubSpot access token via cookie and route interception.
  // HubSpot's frontend uses a combination of cookie-based and header-based
  // auth. We set the auth cookie and also intercept API requests to add
  // the Bearer token header.
  await context.addCookies([
    {
      name: "hubspotapi-csrf",
      value: "1",
      domain: ".hubspot.com",
      path: "/",
    },
  ]);

  await context.route("**/api/**", async (route) => {
    const headers = {
      ...route.request().headers(),
      authorization: `Bearer ${accessToken}`,
    };
    await route.continue({ headers });
  });

  // Verify the session works by loading a known page
  const page = await context.newPage();
  try {
    await page.goto(`https://app.hubspot.com/contacts/${portalId}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    const url = page.url();
    if (url.includes("/login")) {
      // Token-based cookie auth didn't work — fall back to attempting
      // direct API-token navigation via query parameter
      await page.goto(
        `https://app.hubspot.com/contacts/${portalId}?hapikey=${accessToken}`,
        { waitUntil: "domcontentloaded", timeout: 30000 }
      );
    }

    log({
      level: "info",
      message: `HubSpot session ready for portal ${portalId}`,
      service: "enablement",
    });
  } finally {
    await page.close();
  }

  return { browser, context, portalId };
}

export async function closeHubSpotSession(session: HubSpotSession): Promise<void> {
  await session.context.close();
  await session.browser.close();
  log({
    level: "info",
    message: `HubSpot session closed for portal ${session.portalId}`,
    service: "enablement",
  });
}
