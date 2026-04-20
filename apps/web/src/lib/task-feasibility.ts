import Anthropic from "@anthropic-ai/sdk";

export type FeasibilityVerdict =
  | "AUTOMATABLE"
  | "PARTIAL"
  | "HUMAN"
  | "UNCLEAR";

export interface FeasibilityInput {
  clickupTaskId: string;
  name: string;
  description: string;
}

export interface FeasibilityResult {
  clickupTaskId: string;
  verdict: FeasibilityVerdict;
  confidence: number; // 0-100
  rationale: string;
  signals?: {
    apiAreas?: string[];
    blockers?: string[];
  };
}

const SYSTEM = `You are Rex, a RevOps automation engineer evaluating whether a free-text ClickUp task can be executed by an AI agent calling the HubSpot REST API.

For EACH task, you must decide one of:

- AUTOMATABLE: The task can be fully completed by calling HubSpot REST APIs.
  Examples: "Configure Lifecycle Stage property", "Create SMB deal pipeline with 5 stages", "Build workflow that sends Slack notification on lead creation", "Audit existing properties on Contact object", "Map Account fields to Company fields and create the missing properties".
- PARTIAL: Some concrete sub-steps are automatable but the task as written
  also requires human work (decisions, sign-offs, content authoring, sessions).
  Examples: "Map Salesforce Account to HubSpot Company including custom fields, ownership, and brand attribution" (mapping definition is human, property creation is automatable).
- HUMAN: Requires human work that no API can do.
  Examples: "Build Executive Dashboard" (dashboards must be authored in HubSpot UI), "UAT sign-off session", "Train sales team", "Discovery call", "Walkthrough with stakeholders", "Document decision", "Audit doc delivered", "Coordinate with vendor", "Validate native integration health", "Get written approval".
- UNCLEAR: Description too vague or ambiguous to decide.

KEY RULES:
- HubSpot Reports/Dashboards CANNOT be created via public API → HUMAN.
- "Sign off", "approval", "session", "walkthrough", "training", "document" → almost always HUMAN (unless the doc is just an export).
- "Configure X property", "Create pipeline", "Build workflow", "Create custom object", "Create list", "Create association" → AUTOMATABLE.
- "Map A to B" with no concrete creation step → PARTIAL (decision is human, creation is automatable).
- "Validate" / "spot-check" / "QA" → HUMAN unless it's a count-records-style check.
- "Migration" / "Import N records" → AUTOMATABLE if you have CSV/source; otherwise PARTIAL.

OUTPUT (STRICT):
Return ONLY a JSON object of this shape:

{
  "results": [
    {
      "clickupTaskId": "abc123",
      "verdict": "AUTOMATABLE" | "PARTIAL" | "HUMAN" | "UNCLEAR",
      "confidence": 0-100,
      "rationale": "1-2 sentences explaining the verdict",
      "signals": {
        "apiAreas": ["properties", "pipelines", "workflows", ...],
        "blockers": ["dashboard UI", "human sign-off", ...]
      }
    },
    ...
  ]
}

Return ONLY the JSON. No prose, no markdown fences.`;

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text;
}

const VALID_VERDICTS: FeasibilityVerdict[] = [
  "AUTOMATABLE",
  "PARTIAL",
  "HUMAN",
  "UNCLEAR",
];

export async function analyzeFeasibility(
  tasks: FeasibilityInput[]
): Promise<FeasibilityResult[]> {
  if (tasks.length === 0) return [];

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const client = new Anthropic({ apiKey });

  // Chunk to avoid blowing context for huge lists
  const CHUNK = 40;
  const out: FeasibilityResult[] = [];
  for (let i = 0; i < tasks.length; i += CHUNK) {
    const chunk = tasks.slice(i, i + CHUNK);
    const userPrompt =
      `Analyze each of the following ${chunk.length} tasks and return a single JSON object as specified.\n\n` +
      chunk
        .map(
          (t) =>
            `--- TASK ${t.clickupTaskId} ---\nNAME: ${t.name}\nDESCRIPTION:\n${t.description || "(no description)"}\n`
        )
        .join("\n");

    const resp = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      system: SYSTEM,
      messages: [{ role: "user", content: userPrompt }],
    });

    const textBlock = resp.content.find((b: any) => b.type === "text") as
      | { type: "text"; text: string }
      | undefined;
    if (!textBlock) throw new Error("Claude returned no text");

    const raw = extractJson(textBlock.text);
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch (err: any) {
      throw new Error(
        `Feasibility JSON parse failed: ${err.message}. Raw: ${raw.slice(0, 200)}`
      );
    }
    const results = Array.isArray(parsed?.results) ? parsed.results : [];
    for (const r of results) {
      const verdict = VALID_VERDICTS.includes(r?.verdict)
        ? (r.verdict as FeasibilityVerdict)
        : "UNCLEAR";
      const confidenceRaw = Number(r?.confidence);
      const confidence = Number.isFinite(confidenceRaw)
        ? Math.max(0, Math.min(100, Math.round(confidenceRaw)))
        : 50;
      out.push({
        clickupTaskId: String(r?.clickupTaskId || ""),
        verdict,
        confidence,
        rationale: String(r?.rationale || "").slice(0, 1000),
        signals: r?.signals
          ? {
              apiAreas: Array.isArray(r.signals.apiAreas)
                ? r.signals.apiAreas.map(String).slice(0, 10)
                : undefined,
              blockers: Array.isArray(r.signals.blockers)
                ? r.signals.blockers.map(String).slice(0, 10)
                : undefined,
            }
          : undefined,
      });
    }
  }

  return out.filter((r) => r.clickupTaskId);
}
