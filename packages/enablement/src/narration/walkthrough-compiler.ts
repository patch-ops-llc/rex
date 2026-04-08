import { prisma, log } from "@rex/shared";
import type { BuildPlanData } from "@rex/shared";
import {
  groupStepsByCategory,
  buildNarrationPrompt,
  type WalkthroughContext,
  type WalkthroughStepInput,
} from "./context-assembler";
import { generateNarration, generateWalkthroughTitle } from "./narrator";

export interface CompileWalkthroughOptions {
  engagementId: string;
}

export async function compileWalkthrough(
  options: CompileWalkthroughOptions
): Promise<string> {
  const { engagementId } = options;

  log({
    level: "info",
    message: "Starting walkthrough compilation",
    service: "enablement",
    engagementId,
  });

  const engagement = await prisma.engagement.findUnique({
    where: { id: engagementId },
    include: {
      buildPlan: true,
      implementations: { orderBy: { stepOrder: "asc" } },
      discoveryCalls: {
        where: { status: "COMPLETED" },
        select: { summary: true, structuredData: true },
      },
    },
  });

  if (!engagement) {
    throw new Error(`Engagement ${engagementId} not found`);
  }

  if (!engagement.buildPlan) {
    throw new Error(`No build plan found for engagement ${engagementId}`);
  }

  const planData = engagement.buildPlan.planData as unknown as BuildPlanData;

  const walkthrough = await prisma.walkthrough.create({
    data: {
      engagementId,
      title: "Generating...",
      status: "GENERATING",
    },
  });

  try {
    const discoveryNotes: string[] = [];
    for (const call of engagement.discoveryCalls) {
      if (call.summary) discoveryNotes.push(call.summary);
      const data = call.structuredData as Record<string, unknown> | null;
      if (data?.notes && typeof data.notes === "string") {
        discoveryNotes.push(data.notes);
      }
    }

    const steps: WalkthroughStepInput[] = engagement.implementations.map((impl) => ({
      category: "",
      title: impl.stepName,
      config: impl.config as Record<string, unknown>,
      stepType: impl.stepType,
      stepName: impl.stepName,
      hubspotResponse: impl.hubspotResponse as Record<string, unknown> | null,
    }));

    const buildPlanSummaryParts: string[] = [];
    if (planData.properties?.length) buildPlanSummaryParts.push(`${planData.properties.length} properties`);
    if (planData.pipelines?.length) buildPlanSummaryParts.push(`${planData.pipelines.length} pipelines`);
    if (planData.workflows?.length) buildPlanSummaryParts.push(`${planData.workflows.length} workflows`);
    if (planData.customObjects?.length) buildPlanSummaryParts.push(`${planData.customObjects.length} custom objects`);
    if (planData.lists?.length) buildPlanSummaryParts.push(`${planData.lists.length} lists`);
    if (planData.views?.length) buildPlanSummaryParts.push(`${planData.views.length} views`);

    const context: WalkthroughContext = {
      engagementName: engagement.name,
      clientName: engagement.clientName,
      industry: engagement.industry ?? undefined,
      discoveryNotes,
      buildPlanSummary: buildPlanSummaryParts.length > 0
        ? `This implementation includes: ${buildPlanSummaryParts.join(", ")}.`
        : "Build plan details not available.",
      steps,
    };

    let stepsToProcess: WalkthroughStepInput[];

    if (steps.length > 0) {
      stepsToProcess = steps;
    } else {
      stepsToProcess = buildStepsFromPlanData(planData);
    }

    const groups = groupStepsByCategory(stepsToProcess, planData);

    await prisma.walkthrough.update({
      where: { id: walkthrough.id },
      data: { status: "NARRATING" },
    });

    const allSteps: Array<{
      stepOrder: number;
      category: string;
      title: string;
      narration: string;
      context: string | null;
      linkedStepId: string | null;
    }> = [];

    let stepOrder = 0;

    for (const group of groups) {
      const prompt = buildNarrationPrompt(context, group);
      const narrated = await generateNarration(prompt);

      for (let i = 0; i < narrated.length; i++) {
        const linkedImpl = group.items[i];
        allSteps.push({
          stepOrder: stepOrder++,
          category: group.category,
          title: narrated[i].title,
          narration: narrated[i].narration,
          context: narrated[i].context || null,
          linkedStepId: linkedImpl?.config ? null : null,
        });
      }
    }

    const { title, description } = await generateWalkthroughTitle(
      context.clientName,
      context.engagementName,
      groups.map((g) => g.label)
    );

    await prisma.$transaction([
      ...allSteps.map((step) =>
        prisma.walkthroughStep.create({
          data: {
            walkthroughId: walkthrough.id,
            ...step,
          },
        })
      ),
      prisma.walkthrough.update({
        where: { id: walkthrough.id },
        data: {
          title,
          description,
          status: "READY",
          generatedAt: new Date(),
        },
      }),
    ]);

    log({
      level: "info",
      message: `Walkthrough compiled: ${allSteps.length} steps across ${groups.length} categories`,
      service: "enablement",
      engagementId,
      meta: { walkthroughId: walkthrough.id },
    });

    return walkthrough.id;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await prisma.walkthrough.update({
      where: { id: walkthrough.id },
      data: { status: "FAILED", description: message },
    });

    log({
      level: "error",
      message: `Walkthrough compilation failed: ${message}`,
      service: "enablement",
      engagementId,
      meta: { walkthroughId: walkthrough.id },
    });

    throw error;
  }
}

function buildStepsFromPlanData(planData: BuildPlanData): WalkthroughStepInput[] {
  const steps: WalkthroughStepInput[] = [];

  if (planData.propertyGroups) {
    for (const group of planData.propertyGroups) {
      steps.push({
        category: "properties",
        title: group.label,
        config: group as unknown as Record<string, unknown>,
        stepType: "property_group",
        stepName: `Property Group: ${group.label}`,
      });
    }
  }

  if (planData.properties) {
    const byGroup = new Map<string, typeof planData.properties>();
    for (const prop of planData.properties) {
      const key = `${prop.objectType}/${prop.groupName}`;
      const list = byGroup.get(key) ?? [];
      list.push(prop);
      byGroup.set(key, list);
    }
    for (const [key, props] of byGroup) {
      steps.push({
        category: "properties",
        title: `Properties: ${key}`,
        config: { properties: props } as unknown as Record<string, unknown>,
        stepType: "property",
        stepName: `Properties in ${key} (${props.length} fields)`,
      });
    }
  }

  if (planData.customObjects) {
    for (const obj of planData.customObjects) {
      steps.push({
        category: "custom_objects",
        title: obj.labels.singular,
        config: obj as unknown as Record<string, unknown>,
        stepType: "custom_object",
        stepName: `Custom Object: ${obj.labels.singular}`,
      });
    }
  }

  if (planData.pipelines) {
    for (const pipeline of planData.pipelines) {
      steps.push({
        category: "pipelines",
        title: pipeline.label,
        config: pipeline as unknown as Record<string, unknown>,
        stepType: "pipeline",
        stepName: `Pipeline: ${pipeline.label}`,
      });
    }
  }

  if (planData.workflows) {
    for (const workflow of planData.workflows) {
      steps.push({
        category: "workflows",
        title: workflow.name,
        config: workflow as unknown as Record<string, unknown>,
        stepType: "workflow",
        stepName: `Workflow: ${workflow.name}`,
      });
    }
  }

  if (planData.lists) {
    for (const list of planData.lists) {
      steps.push({
        category: "lists",
        title: list.name,
        config: list as unknown as Record<string, unknown>,
        stepType: "list",
        stepName: `List: ${list.name}`,
      });
    }
  }

  if (planData.views) {
    for (const view of planData.views) {
      steps.push({
        category: "views",
        title: view.name,
        config: view as unknown as Record<string, unknown>,
        stepType: "view",
        stepName: `View: ${view.name}`,
      });
    }
  }

  return steps;
}
