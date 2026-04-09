import type { App } from "@slack/bolt";
import Anthropic from "@anthropic-ai/sdk";
import { prisma, log } from "@rex/shared";
import { getToolDefinitions, executeTool, type EngagementContext } from "./tools";

const SERVICE = "client-agent";
const MAX_TOOL_ROUNDS = 10;

interface ResolvedContext {
  engagementId: string;
  engagementName: string;
  clientName: string | null;
}

async function resolveContext(
  channelId: string,
  teamId?: string
): Promise<ResolvedContext | null> {
  const mapping = await prisma.clientSlackMapping.findFirst({
    where: channelId
      ? { slackChannelId: channelId }
      : { slackTeamId: teamId },
    include: {
      engagement: { select: { id: true, name: true, clientName: true } },
    },
  });

  if (mapping) {
    return {
      engagementId: mapping.engagement.id,
      engagementName: mapping.engagement.name,
      clientName: mapping.engagement.clientName,
    };
  }

  if (teamId && channelId) {
    const byTeam = await prisma.clientSlackMapping.findFirst({
      where: { slackTeamId: teamId },
      include: {
        engagement: { select: { id: true, name: true, clientName: true } },
      },
    });
    if (byTeam) {
      return {
        engagementId: byTeam.engagement.id,
        engagementName: byTeam.engagement.name,
        clientName: byTeam.engagement.clientName,
      };
    }
  }

  return null;
}

function buildSystemPrompt(ctx: ResolvedContext): string {
  return `You are Rex, the AI RevOps assistant built by PatchOps. You're operating inside a Slack channel linked to the engagement "${ctx.engagementName}"${ctx.clientName ? ` for client ${ctx.clientName}` : ""}.

You have tools to read and modify engagement data — pipeline phases, tasks, action items, scope documents, SOW, and requirements. When a user asks you to do something, USE THE TOOLS TO ACTUALLY DO IT. Don't just acknowledge the request.

## Behavior Rules

- **Execute, don't narrate.** If someone says "clear all action items", call the tool to clear them and confirm what you did.
- **Be concise.** Slack isn't a document — keep responses tight. Use bullet points and bold for structure.
- **Show your work.** After performing an action, briefly confirm what changed (e.g., "Cleared 5 action items from Discovery").
- **Read before writing.** If a request is ambiguous, fetch the current state first so you can give specifics.
- **Use mrkdwn.** Slack supports *bold*, _italic_, \`code\`, and bullet lists.
- When there's no engagement context or you can't help, say so clearly.
- Never fabricate data — if a tool returns empty results, say there are none.`;
}

export function registerMessageHandler(app: App) {
  app.message(async ({ message, client }) => {
    if (message.subtype === "file_share") return;

    const msg = message as any;
    if (!msg.text || msg.bot_id) return;

    const channelId = msg.channel;
    const teamId = msg.team ?? (msg as any).user_team_id;
    const userText = msg.text;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      log({
        level: "warn",
        service: SERVICE,
        message: "ANTHROPIC_API_KEY not set, falling back to reaction-only",
      });
      await client.reactions
        .add({ channel: channelId, timestamp: msg.ts, name: "eyes" })
        .catch(() => {});
      return;
    }

    const thinkingMsg = await client.chat
      .postMessage({
        channel: channelId,
        thread_ts: msg.thread_ts || msg.ts,
        text: "On it...",
      })
      .catch(() => null);

    try {
      const ctx = await resolveContext(channelId, teamId);

      if (!ctx) {
        const fallbackText =
          "This channel isn't linked to an engagement yet. Connect it in the Rex dashboard under *Engagement Settings > Slack Mapping*.";
        if (thinkingMsg?.ts) {
          await client.chat.update({
            channel: channelId,
            ts: thinkingMsg.ts,
            text: fallbackText,
          });
        } else {
          await client.chat.postMessage({
            channel: channelId,
            thread_ts: msg.thread_ts || msg.ts,
            text: fallbackText,
          });
        }
        return;
      }

      const engagementCtx: EngagementContext = {
        engagementId: ctx.engagementId,
        engagementName: ctx.engagementName,
      };

      const response = await runClaudeWithTools(
        apiKey,
        buildSystemPrompt(ctx),
        userText,
        engagementCtx
      );

      if (thinkingMsg?.ts) {
        await client.chat.update({
          channel: channelId,
          ts: thinkingMsg.ts,
          text: response,
        });
      } else {
        await client.chat.postMessage({
          channel: channelId,
          thread_ts: msg.thread_ts || msg.ts,
          text: response,
        });
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      log({
        level: "error",
        service: SERVICE,
        message: "Message handler failed",
        meta: { error: errMsg, channel: channelId },
      });

      const errorText = `Something went wrong processing that request: ${errMsg}`;
      if (thinkingMsg?.ts) {
        await client.chat
          .update({ channel: channelId, ts: thinkingMsg.ts, text: errorText })
          .catch(() => {});
      } else {
        await client.chat
          .postMessage({
            channel: channelId,
            thread_ts: msg.thread_ts || msg.ts,
            text: errorText,
          })
          .catch(() => {});
      }
    }
  });
}

async function runClaudeWithTools(
  apiKey: string,
  systemPrompt: string,
  userText: string,
  ctx: EngagementContext
): Promise<string> {
  const anthropic = new Anthropic({ apiKey });
  const tools = getToolDefinitions();

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userText },
  ];

  let rounds = 0;

  while (rounds < MAX_TOOL_ROUNDS) {
    rounds++;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: systemPrompt,
      messages,
      tools,
    });

    const textParts: string[] = [];
    const toolCalls: {
      id: string;
      name: string;
      input: Record<string, unknown>;
    }[] = [];

    for (const block of response.content) {
      if (block.type === "text") {
        textParts.push(block.text);
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
      }
    }

    if (toolCalls.length === 0) {
      return textParts.join("") || "Done.";
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const call of toolCalls) {
      const result = await executeTool(call.name, call.input, ctx);
      toolResults.push({
        type: "tool_result",
        tool_use_id: call.id,
        content: result,
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  return "Hit the processing limit — the request might be too complex. Try breaking it into smaller asks.";
}
