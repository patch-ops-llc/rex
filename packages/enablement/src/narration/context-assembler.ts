import type {
  BuildPlanData,
  PropertyDefinition,
  PipelineDefinition,
  WorkflowDefinition,
  CustomObjectDefinition,
  ListDefinition,
  ViewDefinition,
} from "@rex/shared";

export interface WalkthroughStepInput {
  category: string;
  title: string;
  config: Record<string, unknown>;
  stepType: string;
  stepName: string;
  hubspotResponse?: Record<string, unknown> | null;
}

export interface WalkthroughContext {
  engagementName: string;
  clientName: string;
  industry?: string;
  discoveryNotes: string[];
  buildPlanSummary: string;
  steps: WalkthroughStepInput[];
}

interface CategoryGroup {
  category: string;
  label: string;
  items: WalkthroughStepInput[];
  planContext: string;
}

const STEP_TYPE_CATEGORIES: Record<string, { category: string; label: string }> = {
  property_group: { category: "properties", label: "Properties & Field Groups" },
  property: { category: "properties", label: "Properties & Field Groups" },
  custom_object: { category: "custom_objects", label: "Custom Objects" },
  association: { category: "custom_objects", label: "Custom Objects" },
  pipeline: { category: "pipelines", label: "Pipelines & Stages" },
  workflow: { category: "workflows", label: "Workflows & Automation" },
  list: { category: "lists", label: "Lists & Segments" },
  view: { category: "views", label: "Views & Saved Filters" },
};

function categorizeStep(stepType: string): { category: string; label: string } {
  return STEP_TYPE_CATEGORIES[stepType] ?? { category: "other", label: "Other Configuration" };
}

function summarizeProperties(properties: PropertyDefinition[]): string {
  const byObject = new Map<string, PropertyDefinition[]>();
  for (const p of properties) {
    const list = byObject.get(p.objectType) ?? [];
    list.push(p);
    byObject.set(p.objectType, list);
  }

  const lines: string[] = [];
  for (const [objectType, props] of byObject) {
    lines.push(`${objectType}: ${props.map((p) => p.label).join(", ")}`);
  }
  return lines.join("\n");
}

function summarizePipelines(pipelines: PipelineDefinition[]): string {
  return pipelines
    .map((p) => `${p.label} (${p.objectType}): ${p.stages.map((s) => s.label).join(" → ")}`)
    .join("\n");
}

function summarizeWorkflows(workflows: WorkflowDefinition[]): string {
  return workflows
    .map((w) => `${w.name} (${w.objectType}): ${w.enrollmentTrigger} → ${w.actions.length} actions`)
    .join("\n");
}

function summarizeCustomObjects(objects: CustomObjectDefinition[]): string {
  return objects
    .map((o) => `${o.labels.singular}: ${o.properties.length} properties, ${o.associations.length} associations`)
    .join("\n");
}

function summarizeLists(lists: ListDefinition[]): string {
  return lists
    .map((l) => `${l.name} (${l.objectType}, ${l.dynamic ? "dynamic" : "static"})`)
    .join("\n");
}

function summarizeViews(views: ViewDefinition[]): string {
  return views.map((v) => `${v.name} (${v.objectType}): ${v.columns.join(", ")}`).join("\n");
}

export function extractPlanContextForCategory(
  planData: BuildPlanData,
  category: string
): string {
  switch (category) {
    case "properties":
      return summarizeProperties(planData.properties);
    case "pipelines":
      return summarizePipelines(planData.pipelines);
    case "workflows":
      return summarizeWorkflows(planData.workflows);
    case "custom_objects":
      return summarizeCustomObjects(planData.customObjects);
    case "lists":
      return summarizeLists(planData.lists);
    case "views":
      return summarizeViews(planData.views);
    default:
      return "";
  }
}

export function groupStepsByCategory(
  steps: WalkthroughStepInput[],
  planData: BuildPlanData
): CategoryGroup[] {
  const groupMap = new Map<string, CategoryGroup>();

  for (const step of steps) {
    const { category, label } = categorizeStep(step.stepType);
    if (!groupMap.has(category)) {
      groupMap.set(category, {
        category,
        label,
        items: [],
        planContext: extractPlanContextForCategory(planData, category),
      });
    }
    groupMap.get(category)!.items.push(step);
  }

  const categoryOrder = ["properties", "custom_objects", "pipelines", "workflows", "lists", "views", "other"];
  return Array.from(groupMap.values()).sort(
    (a, b) => categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category)
  );
}

export function buildNarrationPrompt(
  context: WalkthroughContext,
  group: CategoryGroup
): string {
  return `You are generating a client-facing walkthrough for a HubSpot implementation. Write clear, non-technical narration that a business user can understand.

## Context
- **Client:** ${context.clientName}
- **Engagement:** ${context.engagementName}
${context.industry ? `- **Industry:** ${context.industry}` : ""}

## Discovery Background
${context.discoveryNotes.length > 0 ? context.discoveryNotes.join("\n") : "No discovery notes available."}

## Build Plan Summary
${context.buildPlanSummary}

## Category: ${group.label}

### Plan Details
${group.planContext || "No additional plan context."}

### Implementation Steps
${group.items.map((s, i) => `${i + 1}. **${s.stepName}** (${s.stepType})\n   Config: ${JSON.stringify(s.config, null, 2)}`).join("\n\n")}

---

Generate a JSON array of walkthrough steps for this category. Each step should help the client understand what was built and how to use it.

For each step, provide:
- "title": A clear, concise title (e.g., "Deal Pipeline: Sales Process")
- "narration": 2-4 sentences explaining what this is, how to find it in HubSpot, and how to use it. Write as if speaking directly to the client.
- "context": 1-2 sentences explaining WHY this was built, tying back to discovery requirements or business needs.

Respond with ONLY a valid JSON array, no markdown fencing:
[
  {
    "title": "...",
    "narration": "...",
    "context": "..."
  }
]`;
}
