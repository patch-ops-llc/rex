import Anthropic from "@anthropic-ai/sdk";
import { hubspotRequest } from "@rex/hubspot-engine";

/**
 * Plan & execute a free-text ClickUp task against a HubSpot portal.
 *
 * The model returns a structured plan of HubSpot REST calls. We enforce
 * a path allowlist + method allowlist before anything actually hits the
 * portal in EXECUTE mode. DRY_RUN never calls HubSpot — it just echoes
 * the plan back with simulated results so you can sanity-check.
 */

export type HubSpotMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface PlannedStep {
  intent: string;
  method: HubSpotMethod;
  path: string;
  body?: unknown;
  requiresConfirm?: boolean;
}

export interface ExecutionPlan {
  summary: string;
  assumptions: string[];
  steps: PlannedStep[];
  risks: string[];
}

export interface StepResult {
  stepIndex: number;
  intent: string;
  method: HubSpotMethod;
  path: string;
  status: "ok" | "error" | "skipped" | "blocked" | "dry";
  response?: unknown;
  errorMessage?: string;
}

// ---------- Guardrails ---------------------------------------------------

const METHOD_ALLOWLIST: HubSpotMethod[] = [
  "GET",
  "POST",
  "PATCH",
  "PUT",
  "DELETE",
];

// Path prefixes that are allowed. Anything outside this list is rejected
// before we touch the live portal. Tweak as the executor matures.
const PATH_ALLOWLIST = [
  "/account-info/v3/",
  "/crm/v3/objects/",
  "/crm/v3/properties/",
  "/crm/v3/pipelines/",
  "/crm/v3/lists/",
  "/crm/v3/schemas/",
  "/crm/v3/associations/",
  "/automation/v4/",
  "/marketing/v3/",
  "/cms/v3/",
  "/files/v3/",
  "/settings/v3/",
];

// Hard deny — never touch these regardless of method
const PATH_DENYLIST = [
  "/oauth/",
  "/integrations/v1/",
  "/users/",
  "/account-info/v3/api-usage", // not destructive but pointless
];

export function validateStep(step: PlannedStep): {
  ok: boolean;
  reason?: string;
} {
  if (!step?.method || !step?.path) {
    return { ok: false, reason: "Step missing method or path" };
  }
  const method = step.method.toUpperCase() as HubSpotMethod;
  if (!METHOD_ALLOWLIST.includes(method)) {
    return { ok: false, reason: `Method ${method} not allowed` };
  }
  if (!step.path.startsWith("/")) {
    return { ok: false, reason: "Path must start with /" };
  }
  for (const deny of PATH_DENYLIST) {
    if (step.path.startsWith(deny)) {
      return { ok: false, reason: `Path ${step.path} is denylisted` };
    }
  }
  const allowed = PATH_ALLOWLIST.some((prefix) => step.path.startsWith(prefix));
  if (!allowed) {
    return {
      ok: false,
      reason: `Path ${step.path} not in allowlist`,
    };
  }
  return { ok: true };
}

// ---------- AI planning ---------------------------------------------------

const SYSTEM_PROMPT = `You are Rex, an autonomous RevOps engineer working inside the PatchOps Rex platform.

Your job: turn a free-text ClickUp task description into a concrete, minimal sequence of HubSpot REST API calls that, when executed, will accomplish the task in the target HubSpot portal.

OUTPUT FORMAT (STRICT):
Respond ONLY with a single JSON object matching this shape:

{
  "summary": "1-2 sentence plain-English summary of what you're going to do",
  "assumptions": ["string", ...],
  "risks": ["string", ...],
  "steps": [
    {
      "intent": "short human-readable description of this step",
      "method": "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
      "path": "/crm/v3/properties/contacts",
      "body": { ... } | null,
      "requiresConfirm": true | false
    }
  ]
}

GUARDRAILS — DO NOT VIOLATE:
- Only use these path prefixes:
  /account-info/v3/, /crm/v3/objects/, /crm/v3/properties/, /crm/v3/pipelines/,
  /crm/v3/lists/, /crm/v3/schemas/, /crm/v3/associations/, /automation/v4/,
  /marketing/v3/, /cms/v3/, /files/v3/, /settings/v3/
- Never use /oauth/, /users/, /integrations/v1/.
- Mark requiresConfirm=true for any DELETE, any update touching >5 records,
  or any change to existing pipelines/properties (vs creating new ones).
- If the task is ambiguous or requires destructive actions you cannot confidently
  scope, return an empty steps array and explain in "risks".
- If the task asks for something not achievable via the HubSpot REST API
  (e.g. "train a sales team", "design a workflow diagram"), return empty steps
  and put the human-action items in "assumptions".
- Prefer GET / discovery steps first if the plan needs to inspect existing state.
- Keep plans short. 1-10 steps. Audit-style tasks should be mostly GETs.

Return ONLY the JSON. No prose, no markdown fences, no commentary.`;

export interface PlanRequestInput {
  taskName: string;
  taskDescription: string;
  portalHubId: string;
  acceptanceCriteria?: string | null;
}

function extractFirstJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text;
}

export async function generatePlan(
  input: PlanRequestInput
): Promise<ExecutionPlan> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const client = new Anthropic({ apiKey });

  const userPrompt = `TARGET HUBSPOT PORTAL: Hub ID ${input.portalHubId}

CLICKUP TASK NAME:
${input.taskName}

CLICKUP TASK DESCRIPTION:
${input.taskDescription || "(no description)"}

${input.acceptanceCriteria ? `ACCEPTANCE CRITERIA:\n${input.acceptanceCriteria}\n` : ""}
Generate the JSON plan now.`;

  const resp = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = resp.content.find((b: any) => b.type === "text") as
    | { type: "text"; text: string }
    | undefined;
  if (!textBlock) throw new Error("Claude returned no text content");

  const raw = extractFirstJson(textBlock.text);
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch (err: any) {
    throw new Error(
      `Claude returned non-JSON plan: ${err.message}. Raw: ${raw.slice(0, 200)}`
    );
  }

  const plan: ExecutionPlan = {
    summary: String(parsed.summary || "(no summary)"),
    assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions : [],
    risks: Array.isArray(parsed.risks) ? parsed.risks : [],
    steps: Array.isArray(parsed.steps)
      ? parsed.steps.map((s: any) => ({
          intent: String(s.intent || ""),
          method: String(s.method || "GET").toUpperCase() as HubSpotMethod,
          path: String(s.path || ""),
          body: s.body ?? undefined,
          requiresConfirm: Boolean(s.requiresConfirm),
        }))
      : [],
  };

  return plan;
}

// ---------- Execution -----------------------------------------------------

export interface ExecuteOptions {
  plan: ExecutionPlan;
  accessToken: string;
  dryRun: boolean;
  /** Set of step indices the user explicitly confirmed (for requiresConfirm steps) */
  confirmedSteps?: number[];
}

export async function executePlan(
  opts: ExecuteOptions
): Promise<StepResult[]> {
  const results: StepResult[] = [];
  const confirmed = new Set(opts.confirmedSteps ?? []);

  for (let i = 0; i < opts.plan.steps.length; i++) {
    const step = opts.plan.steps[i];
    const validation = validateStep(step);
    if (!validation.ok) {
      results.push({
        stepIndex: i,
        intent: step.intent,
        method: step.method,
        path: step.path,
        status: "blocked",
        errorMessage: validation.reason,
      });
      continue;
    }

    if (!opts.dryRun && step.requiresConfirm && !confirmed.has(i)) {
      results.push({
        stepIndex: i,
        intent: step.intent,
        method: step.method,
        path: step.path,
        status: "skipped",
        errorMessage: "Step requires explicit confirmation",
      });
      continue;
    }

    if (opts.dryRun) {
      results.push({
        stepIndex: i,
        intent: step.intent,
        method: step.method,
        path: step.path,
        status: "dry",
        response: {
          dryRun: true,
          wouldSend: { method: step.method, path: step.path, body: step.body },
        },
      });
      continue;
    }

    try {
      const response = await hubspotRequest(
        opts.accessToken,
        step.method,
        step.path,
        step.body
      );
      results.push({
        stepIndex: i,
        intent: step.intent,
        method: step.method,
        path: step.path,
        status: "ok",
        response,
      });
    } catch (err: any) {
      results.push({
        stepIndex: i,
        intent: step.intent,
        method: step.method,
        path: step.path,
        status: "error",
        errorMessage: err?.message || "Request failed",
        response: err?.hubspotError,
      });
    }
  }

  return results;
}
