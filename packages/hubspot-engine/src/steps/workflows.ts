import type { WorkflowDefinition } from "@rex/shared";
import type { ExecutionContext, StepResult } from "../types";
import { hubspotRequest } from "../client";

const OBJECT_TYPE_IDS: Record<string, string> = {
  contacts: "0-1",
  companies: "0-2",
  deals: "0-3",
  tickets: "0-5",
};

/**
 * Maps build-plan action types to HubSpot actionTypeId values.
 * Object-type-specific IDs are keyed by objectType; _default is the fallback.
 */
const ACTION_TYPE_MAP: Record<string, Record<string, string>> = {
  set_property: {
    contacts: "0-5",
    companies: "0-35",
    deals: "0-36",
    tickets: "0-37",
  },
  delay: { _default: "0-1" },
  create_task: { _default: "0-2" },
  send_internal_email: { _default: "0-3" },
  send_email: { _default: "0-4" },
  send_notification: { _default: "0-9" },
  add_to_list: { _default: "0-13" },
  create_record: { _default: "0-14" },
};

interface HubSpotAction {
  type: "SINGLE_CONNECTION";
  actionId: string;
  actionTypeVersion: number;
  actionTypeId: string;
  connection?: {
    edgeType: "STANDARD";
    nextActionId: string;
  };
  fields: Record<string, unknown>;
}

function resolveActionTypeId(
  actionType: string,
  objectType: string,
): string | null {
  const mapping = ACTION_TYPE_MAP[actionType];
  if (!mapping) return null;
  return mapping[objectType] || mapping._default || null;
}

function buildActionFields(
  actionType: string,
  config: Record<string, unknown>,
): Record<string, unknown> {
  switch (actionType) {
    case "set_property":
      return {
        properties: [
          {
            targetProperty: config.propertyName as string,
            value: {
              type: "STATIC_VALUE",
              staticValue: String(config.value),
            },
          },
        ],
      };

    case "delay":
      return {
        delta: String(config.duration ?? config.minutes ?? 1440),
        time_unit: String(config.unit ?? "MINUTES").toUpperCase(),
      };

    case "create_task": {
      const fields: Record<string, unknown> = {
        subject:
          (config.subject as string) ||
          (config.title as string) ||
          "Task from workflow",
      };
      if (config.body || config.notes) {
        fields.body = (config.body as string) || (config.notes as string);
      }
      return fields;
    }

    case "send_notification":
    case "send_internal_email":
      return {
        subject: (config.subject as string) || "Workflow notification",
        body: (config.body as string) || (config.message as string) || "",
        delivery_method: "APP",
      };

    case "send_email":
      return {
        content_id: String(config.emailId || config.contentId || ""),
      };

    case "add_to_list":
      return {
        operation: "ADD",
        list_id: String(config.listId || ""),
      };

    case "create_record": {
      const objectTypeId =
        OBJECT_TYPE_IDS[config.objectType as string] ||
        (config.objectType as string) ||
        "0-5";
      const props: Array<{
        targetProperty: string;
        value: { type: string; staticValue: string };
      }> = [];
      if (config.properties && typeof config.properties === "object") {
        for (const [key, val] of Object.entries(
          config.properties as Record<string, string>,
        )) {
          props.push({
            targetProperty: key,
            value: { type: "STATIC_VALUE", staticValue: String(val) },
          });
        }
      }
      return { object_type_id: objectTypeId, properties: props };
    }

    default:
      return { ...config };
  }
}

function buildActions(
  workflow: WorkflowDefinition,
): { actions: HubSpotAction[]; unmappedActions: string[] } {
  const actions: HubSpotAction[] = [];
  const unmappedActions: string[] = [];
  let nextId = 1;

  for (let i = 0; i < workflow.actions.length; i++) {
    const action = workflow.actions[i];
    const actionTypeId = resolveActionTypeId(
      action.type,
      workflow.objectType,
    );

    if (!actionTypeId) {
      unmappedActions.push(
        `${action.type}: ${action.description}`,
      );
      continue;
    }

    const currentId = String(nextId++);
    const fields = buildActionFields(action.type, action.config);
    const hsAction: HubSpotAction = {
      type: "SINGLE_CONNECTION",
      actionId: currentId,
      actionTypeVersion: 0,
      actionTypeId,
      fields,
    };

    actions.push(hsAction);
  }

  // Wire up connections between sequential actions
  for (let i = 0; i < actions.length - 1; i++) {
    actions[i].connection = {
      edgeType: "STANDARD",
      nextActionId: actions[i + 1].actionId,
    };
  }

  return { actions, unmappedActions };
}

export async function executeWorkflow(
  workflow: WorkflowDefinition,
  ctx: ExecutionContext,
): Promise<StepResult> {
  if (ctx.dryRun) {
    return { success: true, skipped: true, skipReason: "Dry run" };
  }

  const { actions, unmappedActions } = buildActions(workflow);

  if (actions.length === 0) {
    return {
      success: true,
      skipped: true,
      skipReason:
        `Workflow "${workflow.name}" has no auto-mappable actions. ` +
        `Manual setup required for: ${unmappedActions.join("; ")}. ` +
        `Trigger: ${workflow.enrollmentTrigger}`,
      hubspotResponse: { flaggedForHuman: true, workflowSpec: workflow },
    };
  }

  const objectTypeId =
    OBJECT_TYPE_IDS[workflow.objectType] || workflow.objectType;
  const flowType =
    workflow.objectType === "contacts" ? "CONTACT_FLOW" : "PLATFORM_FLOW";

  const body: Record<string, unknown> = {
    isEnabled: false,
    flowType: "WORKFLOW",
    name: workflow.name,
    startActionId: actions[0].actionId,
    nextAvailableActionId: String(actions.length + 1),
    actions,
    enrollmentCriteria: {
      shouldReEnroll: false,
      type: "FILTER_BASED",
      eventFilterBranches: [],
      listMembershipFilterBranches: [],
    },
    timeWindows: [],
    blockedDates: [],
    customProperties: {
      rexEnrollmentTrigger: workflow.enrollmentTrigger,
    },
    crmObjectCreationStatus: "COMPLETE",
    type: flowType,
    objectTypeId,
    suppressionListIds: [],
    canEnrollFromSalesforce: false,
  };

  try {
    const response = await hubspotRequest(
      ctx.accessToken,
      "POST",
      "/automation/v4/flows",
      body,
    );

    const res = response as any;
    const notes: string[] = [];

    notes.push(
      `Created DISABLED — enrollment trigger must be configured manually: "${workflow.enrollmentTrigger}"`,
    );

    if (unmappedActions.length > 0) {
      notes.push(
        `${unmappedActions.length} action(s) could not be auto-mapped and need manual addition: ${unmappedActions.join("; ")}`,
      );
    }

    return {
      success: true,
      hubspotResponse: {
        flowId: res.id,
        name: res.name,
        isEnabled: res.isEnabled,
        actionCount: actions.length,
        unmappedActions,
        notes,
      },
      rollbackData: {
        action: "DELETE",
        path: `/automation/v4/flows/${res.id}`,
        flowId: res.id,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      errorMessage: `Workflow "${workflow.name}" creation failed: ${err.message}`,
      hubspotResponse: {
        error: err.hubspotError,
        attemptedPayload: body,
        unmappedActions,
      },
    };
  }
}
