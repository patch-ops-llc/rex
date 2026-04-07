import type Anthropic from "@anthropic-ai/sdk";
import { prisma, decrypt } from "@rex/shared";
import {
  getSlackClient,
  listChannels,
  readMessages,
  readThread,
  searchMessages,
  sendMessage,
  addReaction,
  getUserProfile,
  listUsers,
} from "./slack";

export function getSlackToolDefinitions(): Anthropic.Tool[] {
  return [
    {
      name: "slack_list_workspaces",
      description:
        "List all connected Slack workspaces. Use this first to discover which workspaces are available before performing other Slack operations.",
      input_schema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
    {
      name: "slack_list_channels",
      description:
        "List channels in a Slack workspace. Returns channel names, topics, purposes, and member counts. Use the workspace_id from slack_list_workspaces.",
      input_schema: {
        type: "object" as const,
        properties: {
          workspace_id: {
            type: "string",
            description: "The Rex workspace ID (from slack_list_workspaces)",
          },
          types: {
            type: "string",
            description:
              'Channel types to include, comma-separated. Options: public_channel, private_channel. Default: "public_channel,private_channel"',
          },
          limit: {
            type: "number",
            description: "Max channels to return (default 200)",
          },
        },
        required: ["workspace_id"],
      },
    },
    {
      name: "slack_read_messages",
      description:
        "Read recent messages from a Slack channel. Returns message text, authors, and timestamps. Useful for catching up on conversations or finding specific information.",
      input_schema: {
        type: "object" as const,
        properties: {
          workspace_id: {
            type: "string",
            description: "The Rex workspace ID",
          },
          channel_id: {
            type: "string",
            description: "The Slack channel ID (from slack_list_channels)",
          },
          limit: {
            type: "number",
            description: "Number of messages to retrieve (default 50, max 100)",
          },
        },
        required: ["workspace_id", "channel_id"],
      },
    },
    {
      name: "slack_read_thread",
      description:
        "Read all replies in a Slack thread. Use this to get the full context of a threaded conversation.",
      input_schema: {
        type: "object" as const,
        properties: {
          workspace_id: {
            type: "string",
            description: "The Rex workspace ID",
          },
          channel_id: {
            type: "string",
            description: "The Slack channel ID",
          },
          thread_ts: {
            type: "string",
            description:
              "The timestamp of the parent message (the thread_ts from slack_read_messages)",
          },
        },
        required: ["workspace_id", "channel_id", "thread_ts"],
      },
    },
    {
      name: "slack_search_messages",
      description:
        "Search for messages across a Slack workspace. Supports Slack search syntax (e.g., 'from:@user', 'in:#channel', 'has:link', date ranges). Very useful for finding specific conversations or topics.",
      input_schema: {
        type: "object" as const,
        properties: {
          workspace_id: {
            type: "string",
            description: "The Rex workspace ID",
          },
          query: {
            type: "string",
            description:
              "Search query. Supports Slack search operators like from:, in:, has:, before:, after:, etc.",
          },
          count: {
            type: "number",
            description: "Number of results to return (default 20)",
          },
        },
        required: ["workspace_id", "query"],
      },
    },
    {
      name: "slack_send_message",
      description:
        "Send a message to a Slack channel or thread. Use thoughtfully — confirm with the user before sending messages on their behalf unless they explicitly asked you to.",
      input_schema: {
        type: "object" as const,
        properties: {
          workspace_id: {
            type: "string",
            description: "The Rex workspace ID",
          },
          channel_id: {
            type: "string",
            description: "The Slack channel ID to send to",
          },
          text: {
            type: "string",
            description: "The message text to send (supports Slack mrkdwn formatting)",
          },
          thread_ts: {
            type: "string",
            description: "Optional thread timestamp to reply in a thread",
          },
        },
        required: ["workspace_id", "channel_id", "text"],
      },
    },
    {
      name: "slack_add_reaction",
      description:
        "Add an emoji reaction to a message in Slack.",
      input_schema: {
        type: "object" as const,
        properties: {
          workspace_id: {
            type: "string",
            description: "The Rex workspace ID",
          },
          channel_id: {
            type: "string",
            description: "The Slack channel ID",
          },
          timestamp: {
            type: "string",
            description: "The message timestamp to react to",
          },
          emoji: {
            type: "string",
            description: 'Emoji name without colons (e.g., "thumbsup", "eyes", "white_check_mark")',
          },
        },
        required: ["workspace_id", "channel_id", "timestamp", "emoji"],
      },
    },
    {
      name: "slack_get_user_profile",
      description:
        "Get profile information for a Slack user by their user ID. Useful for resolving user IDs seen in messages to real names.",
      input_schema: {
        type: "object" as const,
        properties: {
          workspace_id: {
            type: "string",
            description: "The Rex workspace ID",
          },
          user_id: {
            type: "string",
            description: "The Slack user ID (e.g., U01ABC123)",
          },
        },
        required: ["workspace_id", "user_id"],
      },
    },
    {
      name: "slack_list_users",
      description:
        "List all (non-bot) users in a Slack workspace. Returns names, display names, and email addresses.",
      input_schema: {
        type: "object" as const,
        properties: {
          workspace_id: {
            type: "string",
            description: "The Rex workspace ID",
          },
        },
        required: ["workspace_id"],
      },
    },
  ];
}

async function getClientForWorkspace(workspaceId: string) {
  const workspace = await prisma.slackWorkspace.findUnique({
    where: { id: workspaceId },
  });

  if (!workspace || !workspace.isActive) {
    throw new Error(`Workspace "${workspaceId}" not found or inactive`);
  }

  const token = decrypt(workspace.accessToken);
  return { client: getSlackClient(token), workspace };
}

export async function executeSlackTool(
  toolName: string,
  input: Record<string, unknown>
): Promise<string> {
  try {
    switch (toolName) {
      case "slack_list_workspaces": {
        const workspaces = await prisma.slackWorkspace.findMany({
          where: { isActive: true },
          select: { id: true, teamId: true, teamName: true },
          orderBy: { teamName: "asc" },
        });
        if (workspaces.length === 0) {
          return JSON.stringify({
            message: "No Slack workspaces are connected. Ask the user to connect one in Settings.",
            workspaces: [],
          });
        }
        return JSON.stringify({ workspaces });
      }

      case "slack_list_channels": {
        const { client } = await getClientForWorkspace(input.workspace_id as string);
        const result = await listChannels(client, {
          types: (input.types as string) || undefined,
          limit: (input.limit as number) || undefined,
        });
        return JSON.stringify(result);
      }

      case "slack_read_messages": {
        const { client } = await getClientForWorkspace(input.workspace_id as string);
        const result = await readMessages(client, input.channel_id as string, {
          limit: Math.min((input.limit as number) || 50, 100),
        });
        return JSON.stringify(result);
      }

      case "slack_read_thread": {
        const { client } = await getClientForWorkspace(input.workspace_id as string);
        const result = await readThread(
          client,
          input.channel_id as string,
          input.thread_ts as string
        );
        return JSON.stringify(result);
      }

      case "slack_search_messages": {
        const { client } = await getClientForWorkspace(input.workspace_id as string);
        const result = await searchMessages(client, input.query as string, {
          count: (input.count as number) || undefined,
        });
        return JSON.stringify(result);
      }

      case "slack_send_message": {
        const { client } = await getClientForWorkspace(input.workspace_id as string);
        const result = await sendMessage(
          client,
          input.channel_id as string,
          input.text as string,
          { threadTs: input.thread_ts as string | undefined }
        );
        return JSON.stringify(result);
      }

      case "slack_add_reaction": {
        const { client } = await getClientForWorkspace(input.workspace_id as string);
        const result = await addReaction(
          client,
          input.channel_id as string,
          input.timestamp as string,
          input.emoji as string
        );
        return JSON.stringify(result);
      }

      case "slack_get_user_profile": {
        const { client } = await getClientForWorkspace(input.workspace_id as string);
        const result = await getUserProfile(client, input.user_id as string);
        return JSON.stringify(result);
      }

      case "slack_list_users": {
        const { client } = await getClientForWorkspace(input.workspace_id as string);
        const result = await listUsers(client);
        return JSON.stringify(result);
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Tool execution failed";
    return JSON.stringify({ error: message });
  }
}
