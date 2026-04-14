import type { ListDefinition } from "@rex/shared";
import type { ExecutionContext, StepResult } from "../types";
import { hubspotRequest } from "../client";

const OBJECT_TYPE_IDS: Record<string, string> = {
  contacts: "0-1",
  companies: "0-2",
  deals: "0-3",
  tickets: "0-5",
};

export async function executeList(
  list: ListDefinition,
  ctx: ExecutionContext,
): Promise<StepResult> {
  if (ctx.dryRun) {
    return { success: true, skipped: true, skipReason: "Dry run" };
  }

  try {
    const objectTypeId = OBJECT_TYPE_IDS[list.objectType] || list.objectType;

    const body: Record<string, unknown> = {
      name: list.name,
      objectTypeId,
      processingType: list.dynamic ? "DYNAMIC" : "MANUAL",
    };

    if (list.filterGroups?.length) {
      body.filterBranch = {
        filterBranchType: "OR",
        filterBranches: list.filterGroups.map((group) => ({
          filterBranchType: "AND",
          filterBranches: [],
          filters: Array.isArray(group) ? group : [group],
        })),
        filters: [],
      };
    }

    const response = await hubspotRequest(
      ctx.accessToken,
      "POST",
      "/crm/v3/lists/",
      body,
    );

    const res = response as any;
    return {
      success: true,
      hubspotResponse: res,
      rollbackData: {
        action: "DELETE",
        path: `/crm/v3/lists/${res.listId}`,
        listId: res.listId,
      },
    };
  } catch (err: any) {
    if (err.status === 400 && err.message?.includes("filter")) {
      return {
        success: false,
        errorMessage: `List "${list.name}" has invalid filter config — flagged for human review. Error: ${err.message}`,
        hubspotResponse: err.hubspotError,
      };
    }

    return {
      success: false,
      errorMessage: err.message,
      hubspotResponse: err.hubspotError,
    };
  }
}
