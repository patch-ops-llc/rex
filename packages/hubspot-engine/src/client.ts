import { log } from "@rex/shared";

const HUBSPOT_BASE = "https://api.hubapi.com";
const RATE_LIMIT_DELAY_MS = 120;
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 2000;

let lastRequestTime = 0;

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_DELAY_MS) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

export interface HubSpotApiError {
  status: number;
  category: string;
  message: string;
  correlationId?: string;
  errors?: Array<{ message: string; context?: Record<string, string[]> }>;
}

export async function hubspotRequest<T = unknown>(
  accessToken: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    await rateLimit();

    const url = `${HUBSPOT_BASE}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get("Retry-After") || "10", 10);
        log({
          level: "warn",
          service: "hubspot-engine",
          message: `Rate limited, retrying after ${retryAfter}s`,
          meta: { path, attempt },
        });
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }

      if (res.status === 409) {
        const errorBody: any = await res.json().catch(() => ({}));
        return { _conflict: true, ...errorBody } as T;
      }

      if (!res.ok) {
        const errorBody: any = await res.json().catch(() => ({ message: res.statusText }));
        throw Object.assign(new Error(errorBody.message || `HTTP ${res.status}`), {
          status: res.status,
          hubspotError: errorBody,
        });
      }

      if (res.status === 204) return {} as T;
      return (await res.json()) as T;
    } catch (err: any) {
      lastError = err;

      if (err.status && err.status >= 400 && err.status < 500 && err.status !== 429) {
        throw err;
      }

      if (attempt < MAX_RETRIES - 1) {
        const delay = RETRY_BACKOFF_MS * Math.pow(2, attempt);
        log({
          level: "warn",
          service: "hubspot-engine",
          message: `Request failed, retrying in ${delay}ms`,
          meta: { path, attempt, error: err.message },
        });
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError || new Error("Request failed after retries");
}

export async function verifyPortalAccess(
  accessToken: string,
): Promise<{ portalId: number; accountType: string; timeZone: string }> {
  const info = await hubspotRequest<any>(
    accessToken,
    "GET",
    "/account-info/v3/details",
  );
  return {
    portalId: info.portalId,
    accountType: info.accountType,
    timeZone: info.timeZone,
  };
}
