import { prisma, decrypt, log } from "@rex/shared";
import type { BuildPlanData } from "@rex/shared";
import { filterRejectedPlanItems } from "@rex/shared";
import type { ExecutionContext, ExecutionSummary, StepResult } from "./types";
import { verifyPortalAccess } from "./client";
import { executePropertyGroup } from "./steps/property-groups";
import { executeProperty } from "./steps/properties";
import { executeCustomObject } from "./steps/custom-objects";
import { executeAssociation } from "./steps/associations";
import { executePipeline } from "./steps/pipelines";
import { executeList } from "./steps/lists";
import { executeWorkflow } from "./steps/workflows";

interface ExecuteBuildPlanOptions {
  engagementId: string;
  dryRun?: boolean;
}

interface PlannedStep {
  stepType: string;
  stepName: string;
  stepOrder: number;
  config: Record<string, unknown>;
  run: (ctx: ExecutionContext) => Promise<StepResult>;
}

function flattenBuildPlan(plan: BuildPlanData): PlannedStep[] {
  const steps: PlannedStep[] = [];
  let order = 0;

  for (const group of plan.propertyGroups) {
    steps.push({
      stepType: "property_group",
      stepName: `Create property group: ${group.label} (${group.objectType})`,
      stepOrder: order++,
      config: group as unknown as Record<string, unknown>,
      run: (ctx) => executePropertyGroup(group, ctx),
    });
  }

  for (const obj of plan.customObjects) {
    steps.push({
      stepType: "custom_object",
      stepName: `Create custom object: ${obj.labels.singular}`,
      stepOrder: order++,
      config: obj as unknown as Record<string, unknown>,
      run: (ctx) => executeCustomObject(obj, ctx),
    });
  }

  for (const prop of plan.properties) {
    steps.push({
      stepType: "property",
      stepName: `Create property: ${prop.label} (${prop.objectType})`,
      stepOrder: order++,
      config: prop as unknown as Record<string, unknown>,
      run: (ctx) => executeProperty(prop, ctx),
    });
  }

  for (const assoc of plan.associations) {
    steps.push({
      stepType: "association",
      stepName: `Create association: ${assoc.fromObject} → ${assoc.toObject} (${assoc.name})`,
      stepOrder: order++,
      config: assoc as unknown as Record<string, unknown>,
      run: (ctx) => executeAssociation(assoc, ctx),
    });
  }

  for (const pipeline of plan.pipelines) {
    steps.push({
      stepType: "pipeline",
      stepName: `Create pipeline: ${pipeline.label} (${pipeline.objectType})`,
      stepOrder: order++,
      config: pipeline as unknown as Record<string, unknown>,
      run: (ctx) => executePipeline(pipeline, ctx),
    });
  }

  for (const list of plan.lists) {
    steps.push({
      stepType: "list",
      stepName: `Create list: ${list.name} (${list.objectType})`,
      stepOrder: order++,
      config: list as unknown as Record<string, unknown>,
      run: (ctx) => executeList(list, ctx),
    });
  }

  for (const wf of plan.workflows) {
    steps.push({
      stepType: "workflow",
      stepName: `Workflow: ${wf.name}`,
      stepOrder: order++,
      config: wf as unknown as Record<string, unknown>,
      run: (ctx) => executeWorkflow(wf, ctx),
    });
  }

  return steps;
}

export async function executeBuildPlan(
  options: ExecuteBuildPlanOptions,
): Promise<ExecutionSummary> {
  const { engagementId, dryRun = false } = options;

  const engagement = await prisma.engagement.findUnique({
    where: { id: engagementId },
    include: {
      buildPlan: true,
      hubspotPortals: true,
    },
  });

  if (!engagement) throw new Error("Engagement not found");
  if (!engagement.buildPlan) throw new Error("No build plan found for engagement");
  if (engagement.buildPlan.status !== "APPROVED") {
    throw new Error(`Build plan is ${engagement.buildPlan.status}, must be APPROVED`);
  }

  const portal = engagement.hubspotPortals.find((p) => p.isActive);
  if (!portal) {
    throw new Error("No active HubSpot portal linked to this engagement");
  }

  const accessToken = decrypt(portal.accessToken);

  log({
    level: "info",
    service: "hubspot-engine",
    message: dryRun ? "Starting dry run" : "Starting build plan execution",
    engagementId,
    meta: { buildPlanId: engagement.buildPlan.id, portalId: portal.portalId },
  });

  const portalInfo = await verifyPortalAccess(accessToken);
  log({
    level: "info",
    service: "hubspot-engine",
    message: `Portal verified: ${portalInfo.portalId} (${portalInfo.accountType})`,
    engagementId,
  });

  const planData = engagement.buildPlan.planData as unknown as BuildPlanData;
  const approvedItemsOnlyPlan = filterRejectedPlanItems(planData);
  const steps = flattenBuildPlan(approvedItemsOnlyPlan);

  if (!dryRun) {
    await prisma.buildPlan.update({
      where: { id: engagement.buildPlan.id },
      data: { status: "IMPLEMENTING" },
    });

    await prisma.engagement.update({
      where: { id: engagementId },
      data: { status: "IMPLEMENTING" },
    });
  }

  const ctx: ExecutionContext = {
    engagementId,
    buildPlanId: engagement.buildPlan.id,
    portalId: portal.id,
    accessToken,
    hubspotPortalId: portal.portalId,
    dryRun,
  };

  const summary: ExecutionSummary = {
    engagementId,
    buildPlanId: engagement.buildPlan.id,
    totalSteps: steps.length,
    completedSteps: 0,
    failedSteps: 0,
    skippedSteps: 0,
    humanRequiredItems: approvedItemsOnlyPlan.humanRequiredItems || [],
    errors: [],
    implementationIds: [],
  };

  for (const step of steps) {
    let impl;
    if (!dryRun) {
      impl = await prisma.implementation.create({
        data: {
          engagementId,
          stepType: step.stepType,
          stepName: step.stepName,
          stepOrder: step.stepOrder,
          config: step.config as any,
          status: "IN_PROGRESS",
        },
      });
      summary.implementationIds.push(impl.id);
    }

    log({
      level: "info",
      service: "hubspot-engine",
      message: `Executing step ${step.stepOrder + 1}/${steps.length}: ${step.stepName}`,
      engagementId,
      meta: { stepType: step.stepType, dryRun },
    });

    let result: StepResult;
    try {
      result = await step.run(ctx);
    } catch (err: any) {
      result = {
        success: false,
        errorMessage: err.message || "Unexpected error",
      };
    }

    if (result.skipped) {
      summary.skippedSteps++;
      if (impl) {
        await prisma.implementation.update({
          where: { id: impl.id },
          data: {
            status: "COMPLETED",
            hubspotResponse: (result.hubspotResponse ?? { skipped: true, reason: result.skipReason }) as any,
            executedAt: new Date(),
          },
        });
      }
      log({
        level: "info",
        service: "hubspot-engine",
        message: `Step skipped: ${result.skipReason}`,
        engagementId,
        meta: { stepType: step.stepType },
      });
    } else if (result.success) {
      summary.completedSteps++;
      if (impl) {
        await prisma.implementation.update({
          where: { id: impl.id },
          data: {
            status: "COMPLETED",
            hubspotResponse: (result.hubspotResponse ?? {}) as any,
            rollbackData: (result.rollbackData as any) ?? null,
            executedAt: new Date(),
          },
        });
      }
      log({
        level: "info",
        service: "hubspot-engine",
        message: `Step completed: ${step.stepName}`,
        engagementId,
        meta: { stepType: step.stepType },
      });
    } else {
      summary.failedSteps++;
      summary.errors.push({
        stepName: step.stepName,
        error: result.errorMessage || "Unknown error",
      });
      if (impl) {
        await prisma.implementation.update({
          where: { id: impl.id },
          data: {
            status: "FAILED",
            errorMessage: result.errorMessage,
            hubspotResponse: (result.hubspotResponse as any) ?? null,
            executedAt: new Date(),
          },
        });
      }
      log({
        level: "error",
        service: "hubspot-engine",
        message: `Step failed: ${step.stepName} — ${result.errorMessage}`,
        engagementId,
        meta: { stepType: step.stepType },
      });
    }
  }

  if (!dryRun) {
    const finalStatus = summary.failedSteps === 0 ? "COMPLETED" : "APPROVED";
    await prisma.buildPlan.update({
      where: { id: engagement.buildPlan.id },
      data: { status: finalStatus as any },
    });

    await prisma.deliveryLogEntry.create({
      data: {
        engagementId,
        action: "BUILD_PLAN_EXECUTED",
        phaseType: "IMPLEMENTATION",
        actor: "rex",
        description:
          `Build plan executed: ${summary.completedSteps} completed, ` +
          `${summary.failedSteps} failed, ${summary.skippedSteps} skipped ` +
          `out of ${summary.totalSteps} steps. ` +
          `${summary.humanRequiredItems.length} items flagged for human action.`,
        metadata: {
          buildPlanId: engagement.buildPlan.id,
          completedSteps: summary.completedSteps,
          failedSteps: summary.failedSteps,
          skippedSteps: summary.skippedSteps,
          totalSteps: summary.totalSteps,
          humanRequiredItems: summary.humanRequiredItems.length,
          errors: summary.errors,
        },
      },
    });
  }

  log({
    level: summary.failedSteps > 0 ? "warn" : "info",
    service: "hubspot-engine",
    message: `Execution complete: ${summary.completedSteps}/${summary.totalSteps} succeeded, ${summary.failedSteps} failed, ${summary.skippedSteps} skipped`,
    engagementId,
    meta: {
      buildPlanId: engagement.buildPlan.id,
      humanRequired: summary.humanRequiredItems.length,
    },
  });

  return summary;
}
