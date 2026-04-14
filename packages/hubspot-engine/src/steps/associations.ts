import type { AssociationDefinition } from "@rex/shared";
import type { ExecutionContext, StepResult } from "../types";
import { hubspotRequest } from "../client";

export async function executeAssociation(
  assoc: AssociationDefinition,
  ctx: ExecutionContext,
): Promise<StepResult> {
  if (ctx.dryRun) {
    return { success: true, skipped: true, skipReason: "Dry run" };
  }

  if (assoc.associationCategory === "HUBSPOT_DEFINED") {
    return {
      success: true,
      skipped: true,
      skipReason: `Association "${assoc.name}" is HubSpot-defined and doesn't need creation`,
    };
  }

  try {
    const body = {
      label: assoc.label || assoc.name,
      name: assoc.name,
    };

    const response = await hubspotRequest(
      ctx.accessToken,
      "POST",
      `/crm/v4/associations/${assoc.fromObject}/${assoc.toObject}/labels`,
      body,
    );

    const res = response as any;
    if (res._conflict) {
      return {
        success: true,
        skipped: true,
        skipReason: `Association "${assoc.name}" already exists`,
        hubspotResponse: res,
      };
    }

    return {
      success: true,
      hubspotResponse: res,
      rollbackData: {
        action: "DELETE_ASSOCIATION_LABEL",
        fromObject: assoc.fromObject,
        toObject: assoc.toObject,
        associationTypeId: res.results?.[0]?.typeId,
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
