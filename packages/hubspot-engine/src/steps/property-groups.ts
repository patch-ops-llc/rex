import type { PropertyGroupDefinition } from "@rex/shared";
import type { ExecutionContext, StepResult } from "../types";
import { hubspotRequest } from "../client";

export async function executePropertyGroup(
  group: PropertyGroupDefinition,
  ctx: ExecutionContext,
): Promise<StepResult> {
  if (ctx.dryRun) {
    return { success: true, skipped: true, skipReason: "Dry run" };
  }

  try {
    const response = await hubspotRequest(
      ctx.accessToken,
      "POST",
      `/crm/v3/properties/${group.objectType}/groups`,
      {
        name: group.name,
        label: group.label,
        displayOrder: group.displayOrder ?? 0,
      },
    );

    const res = response as any;
    if (res._conflict) {
      return {
        success: true,
        skipped: true,
        skipReason: `Property group "${group.name}" already exists on ${group.objectType}`,
        hubspotResponse: res,
      };
    }

    return {
      success: true,
      hubspotResponse: res,
      rollbackData: {
        action: "DELETE",
        path: `/crm/v3/properties/${group.objectType}/groups/${group.name}`,
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
