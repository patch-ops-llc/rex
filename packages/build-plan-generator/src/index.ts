import Anthropic from "@anthropic-ai/sdk";
import { prisma, log } from "@rex/shared";
import type { BuildPlanData } from "@rex/shared";

const anthropic = new Anthropic();

interface GenerateOptions {
  engagementId: string;
}

export async function generateBuildPlan({ engagementId }: GenerateOptions): Promise<BuildPlanData> {
  const engagement = await prisma.engagement.findUnique({
    where: { id: engagementId },
    include: {
      discoveryCalls: {
        where: { status: "COMPLETED" },
        orderBy: { createdAt: "asc" },
        include: {
          insights: true,
          segments: {
            where: { isFinal: true },
            orderBy: { startTime: "asc" },
            take: 200,
          },
        },
      },
      requirementItems: { orderBy: { displayOrder: "asc" } },
      sow: { include: { lineItems: { orderBy: { displayOrder: "asc" } } } },
      scopeDocuments: {
        where: { status: "PROCESSED" },
        select: { parsedData: true, fileName: true },
      },
      scopeAlerts: {
        where: { status: { in: ["OPEN", "ACKNOWLEDGED"] } },
        select: { title: true, description: true, severity: true, type: true },
      },
    },
  });

  if (!engagement) throw new Error("Engagement not found");

  const completedCalls = engagement.discoveryCalls;
  if (completedCalls.length === 0) {
    throw new Error("No completed discovery calls found. Complete at least one discovery session before generating a build plan.");
  }

  let context = `# ENGAGEMENT
- Client: ${engagement.clientName}
- Engagement: ${engagement.name}
- Industry: ${engagement.industry || "Not specified"}
- HubSpot Tier: ${engagement.hubspotTier || "Not specified"}`;

  if (engagement.sow) {
    context += `\n\n# SOW WORKSTREAMS`;
    for (const li of engagement.sow.lineItems) {
      context += `\n- ${li.workstream}: ${li.allocatedHours}h at $${li.hourlyRate}/h`;
      if (li.description) context += ` — ${li.description}`;
    }
  }

  context += `\n\n# DISCOVERY CALLS (${completedCalls.length} completed)`;
  for (const call of completedCalls) {
    context += `\n\n## ${call.title || "Discovery Call"} (${call.insights.length} insights)`;
    if (call.summary) context += `\nSummary: ${call.summary}`;
    if (call.structuredData) {
      const sd = call.structuredData as Record<string, any>;
      for (const [type, value] of Object.entries(sd)) {
        if (type === "entryType" || type === "fileName" || type === "segmentCount") continue;

        if (typeof value === "string" && value.trim()) {
          context += `\n\n### ${type.toUpperCase()}`;
          context += `\n${value}`;
        } else if (Array.isArray(value) && value.length > 0) {
          context += `\n\n### ${type.toUpperCase()} (${value.length})`;
          for (const item of value) {
            if (typeof item === "string") {
              context += `\n- ${item}`;
            } else if (item.content) {
              context += `\n- ${item.content}`;
              if (item.speaker) context += ` (${item.speaker})`;
            }
          }
        }
      }
    }

    if (call.segments.length > 0) {
      context += `\n\n### KEY TRANSCRIPT EXCERPTS`;
      const excerpts = call.segments.slice(0, 50);
      for (const seg of excerpts) {
        context += `\n[${seg.speaker}]: ${seg.text}`;
      }
      if (call.segments.length > 50) {
        context += `\n... (${call.segments.length - 50} more segments)`;
      }
    }
  }

  if (engagement.requirementItems.length > 0) {
    context += `\n\n# REQUIREMENTS (${engagement.requirementItems.length})`;
    for (const req of engagement.requirementItems) {
      const statusMark = req.status === "CONFIRMED" ? "✓" : req.status === "PENDING" ? "?" : "—";
      context += `\n[${statusMark}] [${req.category}] ${req.question}`;
      if (req.answer) context += `\n  → ${req.answer}`;
    }
  }

  if (engagement.scopeDocuments.length > 0) {
    context += `\n\n# SCOPE DOCUMENTS`;
    for (const doc of engagement.scopeDocuments) {
      const parsed = doc.parsedData as any;
      context += `\n\n## ${doc.fileName}`;
      if (parsed?.workstreams) {
        for (const ws of parsed.workstreams) {
          context += `\n- ${ws.name}${ws.description ? `: ${ws.description}` : ""}`;
          if (ws.deliverables?.length) {
            for (const d of ws.deliverables) context += `\n  • ${d}`;
          }
        }
      }
    }
  }

  if (engagement.scopeAlerts.length > 0) {
    context += `\n\n# ACTIVE SCOPE ALERTS`;
    for (const alert of engagement.scopeAlerts) {
      context += `\n- [${alert.severity}] ${alert.title}: ${alert.description}`;
    }
  }

  log({ level: "info", service: "build-plan-generator", message: "Generating build plan", engagementId, meta: { callCount: completedCalls.length } });

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    system: `Your name is Rex. You work with PatchOps — a consulting firm specializing in HubSpot CRM implementations. Your job is to generate a comprehensive, executable HubSpot build plan from discovery output.

You must return ONLY valid JSON matching the BuildPlanData schema. No markdown, no explanation.

Schema:
{
  "version": "1.0",
  "engagement": { "name": string, "clientName": string, "industry?": string, "hubspotTier?": string },
  "propertyGroups": [{ "name": string, "label": string, "objectType": string, "displayOrder?": number }],
  "properties": [{ "name": string, "label": string, "objectType": string, "type": "string"|"number"|"date"|"datetime"|"enumeration"|"bool", "fieldType": string, "groupName": string, "description?": string, "options?": [{ "label": string, "value": string }] }],
  "customObjects": [{ "name": string, "labels": { "singular": string, "plural": string }, "primaryDisplayProperty": string, "properties": [...], "associations": [...] }],
  "associations": [{ "fromObject": string, "toObject": string, "name": string, "label?": string, "associationCategory": "USER_DEFINED"|"HUBSPOT_DEFINED" }],
  "pipelines": [{ "objectType": string, "label": string, "stages": [{ "label": string, "displayOrder": number, "metadata?": {} }] }],
  "workflows": [{ "name": string, "type": string, "objectType": string, "enrollmentTrigger": string, "actions": [{ "type": string, "description": string, "config": {} }] }],
  "lists": [{ "name": string, "objectType": string, "filterGroups": [...], "dynamic": boolean }],
  "views": [{ "name": string, "objectType": string, "columns": [...], "filters?": [...] }],
  "humanRequiredItems": [{ "category": string, "description": string, "reason": string, "priority": "LOW"|"MEDIUM"|"HIGH" }],
  "qaChecklist": [{ "category": string, "description": string, "linkedStepType?": string }]
}

Rules:
- Use HubSpot property naming conventions (snake_case, lowercase, prefixed with client identifier)
- fieldType values: "text", "textarea", "number", "date", "select", "radio", "checkbox", "booleancheckbox", "file"
- objectType values: "contacts", "companies", "deals", "tickets", or custom object names
- Workflows should use descriptive enrollment triggers and clear action descriptions
- Include humanRequiredItems for anything that can't be done via API (UI customization, report building, user training, etc.)
- Generate comprehensive qaChecklist items to verify each build step
- Be specific and actionable — this plan will be executed by an AI engine against the HubSpot API
- If the HubSpot tier is Professional or lower, do not include custom objects (Enterprise only)
- Align the plan with SOW workstreams when a SOW is present
- Flag scope concerns in humanRequiredItems if requirements exceed SOW scope`,
    messages: [
      {
        role: "user",
        content: `Generate a HubSpot build plan from the following discovery data.\n\n${context}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }

  const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON found in Claude response");
  }

  const planData: BuildPlanData = JSON.parse(jsonMatch[0]);

  if (!planData.propertyGroups) planData.propertyGroups = [];
  if (!planData.properties) planData.properties = [];
  if (!planData.customObjects) planData.customObjects = [];
  if (!planData.associations) planData.associations = [];
  if (!planData.pipelines) planData.pipelines = [];
  if (!planData.workflows) planData.workflows = [];
  if (!planData.lists) planData.lists = [];
  if (!planData.views) planData.views = [];
  if (!planData.humanRequiredItems) planData.humanRequiredItems = [];
  if (!planData.qaChecklist) planData.qaChecklist = [];

  log({ level: "info", service: "build-plan-generator", message: "Build plan generated", engagementId, meta: {
    properties: planData.properties.length,
    customObjects: planData.customObjects.length,
    pipelines: planData.pipelines.length,
    workflows: planData.workflows.length,
    humanItems: planData.humanRequiredItems.length,
  }});

  return planData;
}
