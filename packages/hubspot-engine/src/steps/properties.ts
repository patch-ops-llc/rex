import type { PropertyDefinition } from "@rex/shared";
import type { ExecutionContext, StepResult } from "../types";
import { hubspotRequest } from "../client";

export async function executeProperty(
  prop: PropertyDefinition,
  ctx: ExecutionContext,
): Promise<StepResult> {
  if (ctx.dryRun) {
    return { success: true, skipped: true, skipReason: "Dry run" };
  }

  try {
    const body: Record<string, unknown> = {
      name: prop.name,
      label: prop.label,
      type: prop.type,
      fieldType: prop.fieldType,
      groupName: prop.groupName,
    };

    if (prop.description) body.description = prop.description;
    if (prop.hasUniqueValue !== undefined) body.hasUniqueValue = prop.hasUniqueValue;
    if (prop.formField !== undefined) body.formField = prop.formField;

    if (prop.type === "enumeration" && prop.options?.length) {
      body.options = prop.options.map((opt, i) => ({
        label: opt.label,
        value: opt.value,
        displayOrder: opt.displayOrder ?? i,
        hidden: false,
      }));
    }

    const response = await hubspotRequest(
      ctx.accessToken,
      "POST",
      `/crm/v3/properties/${prop.objectType}`,
      body,
    );

    const res = response as any;
    if (res._conflict) {
      return {
        success: true,
        skipped: true,
        skipReason: `Property "${prop.name}" already exists on ${prop.objectType}`,
        hubspotResponse: res,
      };
    }

    return {
      success: true,
      hubspotResponse: res,
      rollbackData: {
        action: "DELETE",
        path: `/crm/v3/properties/${prop.objectType}/${prop.name}`,
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
