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
  /** Human-readable notes about server-side auto-fixes applied to the step body */
  autoFixes?: string[];
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
  (e.g. "train a sales team", "design a workflow diagram", "build a dashboard"),
  return empty steps and put the human-action items in "assumptions".
- Prefer GET / discovery steps first if the plan needs to inspect existing state.
- Keep plans short. 1-10 steps. Audit-style tasks should be mostly GETs.

HUBSPOT API CONVENTIONS — these are the most common mistakes; do not make them:

• CREATE PROPERTY  POST /crm/v3/properties/{objectType}
  REQUIRED body fields:
    - name (string, internal name, lowercase_snake_case, no spaces)
    - label (string, human-readable)
    - type (string) — one of: string, number, date, datetime, enumeration, bool, phone_number
    - fieldType (string) — one of: text, textarea, number, date, select, radio, checkbox, booleancheckbox, phonenumber, calculation_equation
    - groupName (string) — REQUIRED. For standard objects use:
        contacts → "contactinformation"
        companies → "companyinformation"
        deals → "dealinformation"
        tickets → "ticketinformation"
        products → "productinformation"
        line_items → "lineiteminformation"
      For custom objects you must look up an existing group via
      GET /crm/v3/properties/{objectType}/groups first.
  For enumeration type, also include "options": [{ "label": "...", "value": "...", "displayOrder": 0 }]
  Example body for a Contact lifecycle stage helper:
    {
      "name": "smb_segment",
      "label": "SMB Segment",
      "type": "enumeration",
      "fieldType": "select",
      "groupName": "contactinformation",
      "options": [
        { "label": "Tier 1", "value": "tier_1", "displayOrder": 0 },
        { "label": "Tier 2", "value": "tier_2", "displayOrder": 1 }
      ]
    }

• CREATE PIPELINE  POST /crm/v3/pipelines/{objectType}
  REQUIRED body: { "label": "...", "displayOrder": 0, "stages": [ ... ] }
  Each stage REQUIRES: { "label": "...", "displayOrder": 0, "metadata": { "probability": "0.5", "isClosed": "false" } }
  metadata.probability MUST be a string between "0.0" and "1.0".

• CREATE LIST  POST /crm/v3/lists
  REQUIRED body: { "name": "...", "objectTypeId": "0-1" (contacts) | "0-2" (companies) | "0-3" (deals), "processingType": "MANUAL" | "DYNAMIC", "filterBranch": ... (only for DYNAMIC) }

• CREATE/UPDATE OBJECT  POST /crm/v3/objects/{objectType}
  Body: { "properties": { "field": "value", ... }, "associations": [...] (optional) }
  Properties must be the INTERNAL property names (snake_case), not labels.

• ASSOCIATIONS  use the v4 endpoints when possible:
  PUT /crm/v4/objects/{fromType}/{fromId}/associations/default/{toType}/{toId}
  (default associations don't require a labelId)

• Use objectType plural names in URLs: contacts, companies, deals, tickets, products, line_items.
  Custom object URLs use either the object type ID (e.g. "2-12345") or the internal name.

• DO NOT invent property internal names. If the task references existing properties,
  add a discovery GET to /crm/v3/properties/{objectType} first to verify.

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

/**
 * Standard "information" property groups that ship with every HubSpot
 * portal for the built-in objects. We use these as a safe fallback when
 * the planner forgets to set groupName on a CREATE PROPERTY step.
 */
const DEFAULT_GROUP_BY_OBJECT: Record<string, string> = {
  contacts: "contactinformation",
  companies: "companyinformation",
  deals: "dealinformation",
  tickets: "ticketinformation",
  products: "productinformation",
  line_items: "lineiteminformation",
  quotes: "quoteinformation",
};

/**
 * Inspect the planned step and patch in HubSpot fields the model
 * commonly forgets. Returns the (possibly mutated) step plus a list
 * of human-readable notes so the result UI can show what was patched.
 */
function autoFixStep(step: PlannedStep): {
  step: PlannedStep;
  notes: string[];
} {
  const notes: string[] = [];
  const path = step.path;
  const method = step.method.toUpperCase() as HubSpotMethod;

  // POST /crm/v3/properties/{objectType}  → ensure groupName
  const propMatch = path.match(/^\/crm\/v3\/properties\/([^/]+)\/?$/);
  if (method === "POST" && propMatch) {
    const objectType = propMatch[1];
    const body =
      step.body && typeof step.body === "object"
        ? ({ ...(step.body as Record<string, unknown>) } as Record<
            string,
            unknown
          >)
        : ({} as Record<string, unknown>);

    if (!body.groupName || typeof body.groupName !== "string") {
      const fallback = DEFAULT_GROUP_BY_OBJECT[objectType];
      if (fallback) {
        body.groupName = fallback;
        notes.push(
          `auto-filled groupName="${fallback}" (planner omitted it)`
        );
      }
    }

    // type/fieldType pairing: if only one is present, infer the other
    if (body.type === "enumeration" && !body.fieldType) {
      body.fieldType = "select";
      notes.push(`auto-filled fieldType="select" for enumeration property`);
    }
    if (body.type === "string" && !body.fieldType) {
      body.fieldType = "text";
      notes.push(`auto-filled fieldType="text" for string property`);
    }
    if (body.type === "number" && !body.fieldType) {
      body.fieldType = "number";
      notes.push(`auto-filled fieldType="number" for number property`);
    }
    if (body.type === "bool" && !body.fieldType) {
      body.fieldType = "booleancheckbox";
      notes.push(
        `auto-filled fieldType="booleancheckbox" for bool property`
      );
    }
    if (body.type === "date" && !body.fieldType) {
      body.fieldType = "date";
      notes.push(`auto-filled fieldType="date" for date property`);
    }
    if (body.type === "datetime" && !body.fieldType) {
      body.fieldType = "date";
      notes.push(`auto-filled fieldType="date" for datetime property`);
    }

    return { step: { ...step, body }, notes };
  }

  return { step, notes };
}

export async function executePlan(
  opts: ExecuteOptions
): Promise<StepResult[]> {
  const results: StepResult[] = [];
  const confirmed = new Set(opts.confirmedSteps ?? []);

  for (let i = 0; i < opts.plan.steps.length; i++) {
    const rawStep = opts.plan.steps[i];
    const { step, notes: autoFixes } = autoFixStep(rawStep);

    const validation = validateStep(step);
    if (!validation.ok) {
      results.push({
        stepIndex: i,
        intent: step.intent,
        method: step.method,
        path: step.path,
        status: "blocked",
        errorMessage: validation.reason,
        autoFixes: autoFixes.length ? autoFixes : undefined,
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
        autoFixes: autoFixes.length ? autoFixes : undefined,
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
        autoFixes: autoFixes.length ? autoFixes : undefined,
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
        autoFixes: autoFixes.length ? autoFixes : undefined,
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
        autoFixes: autoFixes.length ? autoFixes : undefined,
      });
    }
  }

  return results;
}
