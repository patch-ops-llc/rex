import type { CustomObjectDefinition } from "@rex/shared";
import type { ExecutionContext, StepResult } from "../types";
import { hubspotRequest } from "../client";

export async function executeCustomObject(
  obj: CustomObjectDefinition,
  ctx: ExecutionContext,
): Promise<StepResult> {
  if (ctx.dryRun) {
    return { success: true, skipped: true, skipReason: "Dry run" };
  }

  try {
    const properties = obj.properties.map((p) => ({
      name: p.name,
      label: p.label,
      type: p.type,
      fieldType: p.fieldType,
      groupName: p.groupName || obj.name,
      description: p.description,
      hasUniqueValue: p.hasUniqueValue,
      ...(p.type === "enumeration" && p.options?.length
        ? {
            options: p.options.map((opt, i) => ({
              label: opt.label,
              value: opt.value,
              displayOrder: opt.displayOrder ?? i,
              hidden: false,
            })),
          }
        : {}),
    }));

    const associatedObjects = obj.associations.map((a) => a.toObject);

    const body = {
      name: obj.name,
      labels: obj.labels,
      primaryDisplayProperty: obj.primaryDisplayProperty,
      requiredProperties: [obj.primaryDisplayProperty],
      properties,
      associatedObjects,
    };

    const response = await hubspotRequest(
      ctx.accessToken,
      "POST",
      "/crm/v3/schemas",
      body,
    );

    const res = response as any;
    if (res._conflict) {
      return {
        success: true,
        skipped: true,
        skipReason: `Custom object "${obj.name}" already exists`,
        hubspotResponse: res,
      };
    }

    return {
      success: true,
      hubspotResponse: res,
      rollbackData: {
        action: "DELETE",
        path: `/crm/v3/schemas/${res.objectTypeId || obj.name}`,
        objectTypeId: res.objectTypeId,
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
