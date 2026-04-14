import type { PipelineDefinition } from "@rex/shared";
import type { ExecutionContext, StepResult } from "../types";
import { hubspotRequest } from "../client";

export async function executePipeline(
  pipeline: PipelineDefinition,
  ctx: ExecutionContext,
): Promise<StepResult> {
  if (ctx.dryRun) {
    return { success: true, skipped: true, skipReason: "Dry run" };
  }

  try {
    const body = {
      label: pipeline.label,
      displayOrder: 0,
      stages: pipeline.stages.map((stage) => ({
        label: stage.label,
        displayOrder: stage.displayOrder,
        metadata: stage.metadata || {},
      })),
    };

    const response = await hubspotRequest(
      ctx.accessToken,
      "POST",
      `/crm/v3/pipelines/${pipeline.objectType}`,
      body,
    );

    const res = response as any;
    if (res._conflict) {
      return {
        success: true,
        skipped: true,
        skipReason: `Pipeline "${pipeline.label}" already exists on ${pipeline.objectType}`,
        hubspotResponse: res,
      };
    }

    return {
      success: true,
      hubspotResponse: res,
      rollbackData: {
        action: "DELETE",
        path: `/crm/v3/pipelines/${pipeline.objectType}/${res.id}`,
        pipelineId: res.id,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      errorMessage: err.message,
      hubspotResponse: err.hubspotError,
    };
  }
}
