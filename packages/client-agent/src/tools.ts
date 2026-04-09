import type Anthropic from "@anthropic-ai/sdk";
import { prisma, pipeline } from "@rex/shared";
import type { ProjectTask, CallInsight } from "@rex/shared";

export interface EngagementContext {
  engagementId: string;
  engagementName: string;
}

export function getToolDefinitions(): Anthropic.Tool[] {
  return [
    {
      name: "get_engagement_summary",
      description:
        "Get a summary of the current engagement including status, client name, connected portals, and high-level pipeline progress.",
      input_schema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
    {
      name: "get_pipeline_status",
      description:
        "Get the full pipeline status — all phases with their tasks, statuses, and progress metrics.",
      input_schema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
    {
      name: "get_tasks",
      description:
        "Get tasks, optionally filtered by phase or status. Use this to see what's on the board.",
      input_schema: {
        type: "object" as const,
        properties: {
          phase_type: {
            type: "string",
            description:
              "Filter by phase type (SOW_SETUP, DISCOVERY_PREP, DISCOVERY, REQUIREMENTS, BUILD_PLANNING, BUILD_APPROVAL, IMPLEMENTATION, HUMAN_CLEANUP, UAT, CLOSEOUT). Omit for all phases.",
          },
          status: {
            type: "string",
            description:
              "Filter by status (PENDING, IN_PROGRESS, WAITING_ON_CLIENT, WAITING_ON_APPROVAL, COMPLETED, FAILED, SKIPPED). Omit for all statuses.",
          },
        },
        required: [],
      },
    },
    {
      name: "complete_task",
      description: "Mark a specific task as completed.",
      input_schema: {
        type: "object" as const,
        properties: {
          task_id: {
            type: "string",
            description: "The task ID to complete.",
          },
        },
        required: ["task_id"],
      },
    },
    {
      name: "skip_task",
      description: "Skip a task (mark as not needed).",
      input_schema: {
        type: "object" as const,
        properties: {
          task_id: {
            type: "string",
            description: "The task ID to skip.",
          },
        },
        required: ["task_id"],
      },
    },
    {
      name: "start_task",
      description: "Mark a task as in-progress.",
      input_schema: {
        type: "object" as const,
        properties: {
          task_id: {
            type: "string",
            description: "The task ID to start.",
          },
        },
        required: ["task_id"],
      },
    },
    {
      name: "add_task",
      description: "Add a new task to a pipeline phase.",
      input_schema: {
        type: "object" as const,
        properties: {
          phase_type: {
            type: "string",
            description: "The phase to add the task to.",
          },
          title: { type: "string", description: "Task title." },
          description: { type: "string", description: "Task description." },
          task_type: {
            type: "string",
            description:
              'Task type: AUTO, HUMAN, CLIENT_ACTION, APPROVAL, REVIEW. Default: HUMAN.',
          },
        },
        required: ["phase_type", "title"],
      },
    },
    {
      name: "clear_tasks",
      description:
        "Bulk-clear tasks — mark all matching tasks as COMPLETED or SKIPPED. Use this for requests like 'clear all action items' or 'clear all tasks in discovery'.",
      input_schema: {
        type: "object" as const,
        properties: {
          phase_type: {
            type: "string",
            description:
              "Only clear tasks in this phase. Omit to clear across all phases.",
          },
          status_filter: {
            type: "string",
            description:
              "Only clear tasks with this status (e.g., PENDING, IN_PROGRESS). Omit to clear all non-terminal tasks.",
          },
          mark_as: {
            type: "string",
            enum: ["COMPLETED", "SKIPPED"],
            description:
              'How to mark them — COMPLETED or SKIPPED. Default: COMPLETED.',
          },
        },
        required: [],
      },
    },
    {
      name: "get_action_items",
      description:
        "Get action items extracted from discovery calls (CallInsight records with type ACTION_ITEM).",
      input_schema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
    {
      name: "clear_action_items",
      description:
        "Delete all ACTION_ITEM insights from discovery calls for this engagement.",
      input_schema: {
        type: "object" as const,
        properties: {
          discovery_call_id: {
            type: "string",
            description:
              "Only clear action items from a specific call. Omit to clear all.",
          },
        },
        required: [],
      },
    },
    {
      name: "get_scope_documents",
      description: "List scope documents uploaded for this engagement.",
      input_schema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
    {
      name: "get_sow",
      description:
        "Get the SOW (Statement of Work) for this engagement, including line items.",
      input_schema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
    {
      name: "get_requirements",
      description: "Get requirement items for this engagement.",
      input_schema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
  ];
}

const TERMINAL_STATUSES = ["COMPLETED", "FAILED", "SKIPPED"];

export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  ctx: EngagementContext
): Promise<string> {
  const { engagementId } = ctx;

  try {
    switch (toolName) {
      case "get_engagement_summary": {
        const engagement = await prisma.engagement.findUnique({
          where: { id: engagementId },
          include: {
            hubspotPortals: { select: { id: true, name: true, portalId: true } },
            _count: {
              select: {
                discoveryCalls: true,
                implementations: true,
                workRequests: true,
                scopeDocuments: true,
                tasks: true,
              },
            },
          },
        });
        if (!engagement) return JSON.stringify({ error: "Engagement not found" });
        return JSON.stringify({
          id: engagement.id,
          name: engagement.name,
          clientName: engagement.clientName,
          status: engagement.status,
          industry: engagement.industry,
          hubspotTier: engagement.hubspotTier,
          portals: engagement.hubspotPortals,
          counts: engagement._count,
          createdAt: engagement.createdAt,
        });
      }

      case "get_pipeline_status": {
        const status = await pipeline.getPipelineStatus(engagementId);
        return JSON.stringify(status);
      }

      case "get_tasks": {
        const where: Record<string, unknown> = { engagementId };
        if (input.phase_type) where.phaseType = input.phase_type;
        if (input.status) where.status = input.status;

        const tasks = await prisma.projectTask.findMany({
          where,
          orderBy: [{ phaseType: "asc" }, { displayOrder: "asc" }],
        });
        return JSON.stringify(
          tasks.map((t: ProjectTask) => ({
            id: t.id,
            title: t.title,
            description: t.description,
            status: t.status,
            taskType: t.taskType,
            phaseType: t.phaseType,
          }))
        );
      }

      case "complete_task": {
        const task = await pipeline.completeTask(input.task_id as string);
        return JSON.stringify({
          success: true,
          task: { id: task.id, title: task.title, status: task.status },
        });
      }

      case "skip_task": {
        const task = await prisma.projectTask.update({
          where: { id: input.task_id as string },
          data: { status: "SKIPPED", completedAt: new Date() },
        });
        return JSON.stringify({
          success: true,
          task: { id: task.id, title: task.title, status: task.status },
        });
      }

      case "start_task": {
        const task = await prisma.projectTask.update({
          where: { id: input.task_id as string },
          data: { status: "IN_PROGRESS", startedAt: new Date() },
        });
        return JSON.stringify({
          success: true,
          task: { id: task.id, title: task.title, status: task.status },
        });
      }

      case "add_task": {
        const task = await pipeline.addTask(
          engagementId,
          input.phase_type as string,
          input.title as string,
          (input.description as string) || "",
          (input.task_type as string) || "HUMAN"
        );
        return JSON.stringify({
          success: true,
          task: { id: task.id, title: task.title, status: task.status },
        });
      }

      case "clear_tasks": {
        const where: Record<string, unknown> = { engagementId };
        if (input.phase_type) where.phaseType = input.phase_type;
        if (input.status_filter) {
          where.status = input.status_filter;
        } else {
          where.status = { notIn: TERMINAL_STATUSES };
        }

        const markAs = (input.mark_as as string) || "COMPLETED";
        const result = await prisma.projectTask.updateMany({
          where,
          data: {
            status: markAs as any,
            completedAt: new Date(),
          },
        });
        return JSON.stringify({
          success: true,
          clearedCount: result.count,
          markedAs: markAs,
        });
      }

      case "get_action_items": {
        const calls = await prisma.discoveryCall.findMany({
          where: { engagementId },
          select: { id: true },
        });
        const callIds = calls.map((c) => c.id);
        const items = await prisma.callInsight.findMany({
          where: { discoveryCallId: { in: callIds }, type: "ACTION_ITEM" },
          orderBy: { createdAt: "desc" },
        });
        return JSON.stringify(
          items.map((i: CallInsight) => ({
            id: i.id,
            content: i.content,
            discoveryCallId: i.discoveryCallId,
            createdAt: i.createdAt,
          }))
        );
      }

      case "clear_action_items": {
        const calls = await prisma.discoveryCall.findMany({
          where: { engagementId },
          select: { id: true },
        });
        const callIds = input.discovery_call_id
          ? [input.discovery_call_id as string]
          : calls.map((c) => c.id);

        const result = await prisma.callInsight.deleteMany({
          where: { discoveryCallId: { in: callIds }, type: "ACTION_ITEM" },
        });
        return JSON.stringify({ success: true, deletedCount: result.count });
      }

      case "get_scope_documents": {
        const docs = await prisma.scopeDocument.findMany({
          where: { engagementId },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            fileName: true,
            status: true,
            fileType: true,
            createdAt: true,
          },
        });
        return JSON.stringify(docs);
      }

      case "get_sow": {
        const sow = await prisma.sOW.findFirst({
          where: { engagementId },
          include: { lineItems: { orderBy: { displayOrder: "asc" } } },
        });
        if (!sow) return JSON.stringify({ message: "No SOW found for this engagement" });
        return JSON.stringify(sow);
      }

      case "get_requirements": {
        const items = await prisma.requirementItem.findMany({
          where: { engagementId },
          orderBy: { createdAt: "desc" },
        });
        return JSON.stringify(items);
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Tool execution failed";
    return JSON.stringify({ error: message });
  }
}
