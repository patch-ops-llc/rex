import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@rex/shared";
import {
  getSlackToolDefinitions,
  executeSlackTool,
} from "@/lib/slack-tools";

function extractTranscriptText(transcript: unknown): string {
  if (typeof transcript === "string") return transcript;
  if (transcript && typeof transcript === "object") {
    const t = transcript as Record<string, unknown>;
    if (typeof t.raw === "string") return t.raw;
    if (typeof t.text === "string") return t.text;
    if (typeof t.content === "string") return t.content;
    return JSON.stringify(transcript);
  }
  return String(transcript ?? "");
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n...[truncated]";
}

const MAX_TOOL_ROUNDS = 15;

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY is not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const body = await request.json();
  const messages: Anthropic.MessageParam[] = body.messages ?? [];

  if (!messages.length) {
    return new Response(
      JSON.stringify({ error: "messages array is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  let corpusContext = "";
  try {
    const entries = await prisma.corpusEntry.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    if (entries.length > 0) {
      const chunks = entries.map((entry, i) => {
        const text = truncate(extractTranscriptText(entry.transcript), 4000);
        const meta = [
          entry.category && `Category: ${entry.category}`,
          entry.industry && `Industry: ${entry.industry}`,
          entry.complexity && `Complexity: ${entry.complexity}`,
          entry.outcome && `Outcome: ${entry.outcome}`,
          entry.tags?.length && `Tags: ${entry.tags.join(", ")}`,
          entry.source && `Source: ${entry.source}`,
        ]
          .filter(Boolean)
          .join(" | ");

        return `--- CORPUS ENTRY ${i + 1}: "${entry.name}" ---${meta ? `\n[${meta}]` : ""}\n${text}`;
      });

      corpusContext = chunks.join("\n\n");
    }
  } catch (err) {
    console.error("Failed to load corpus for chat context:", err);
  }

  let slackWorkspaceCount = 0;
  try {
    slackWorkspaceCount = await prisma.slackWorkspace.count({
      where: { isActive: true },
    });
  } catch {
    // DB not connected
  }

  const hasSlack = slackWorkspaceCount > 0;

  const systemPrompt = `You are REX, PatchOps' AI assistant for RevOps consulting. You have deep knowledge about CRM implementations, system integrations, HubSpot, and business automation.

Your knowledge comes from a corpus of discovery call transcripts, project documentation, implementation notes, and other consulting artifacts that PatchOps has accumulated. Use this knowledge to answer questions accurately and helpfully.

${hasSlack ? `You have access to ${slackWorkspaceCount} connected Slack workspace${slackWorkspaceCount > 1 ? "s" : ""}. You can use the Slack tools to:
- List and browse channels
- Read recent messages and threads
- Search for messages by keyword, author, channel, or date
- Send messages and reply to threads
- React to messages
- Look up user profiles

When the user asks about Slack conversations, messages, or wants you to interact with Slack:
1. First use slack_list_workspaces to see available workspaces
2. Then use the appropriate tool to fulfill the request
3. Summarize what you found in a clear, helpful way

Be thoughtful about sending messages — always confirm with the user before posting unless they explicitly asked you to send something specific.` : ""}

When answering:
- Reference specific corpus entries when relevant (by name)
- Be specific about technical details, patterns, and approaches you've seen in the corpus
- If you don't have enough information in the corpus to answer definitively, say so clearly
- Synthesize insights across multiple corpus entries when appropriate
- Maintain a professional but approachable consulting tone

${corpusContext ? `Below is your current corpus of knowledge:\n\n${corpusContext}` : "Note: The corpus is currently empty. No training data has been ingested yet. Let the user know they should add corpus entries via the Corpus page before you can provide knowledge-based answers."}`;

  const client = new Anthropic({ apiKey });
  const tools = hasSlack ? getSlackToolDefinitions() : [];

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      try {
        const conversationMessages: Anthropic.MessageParam[] = messages.map(
          (m) => ({
            role: m.role,
            content: m.content,
          })
        );

        let rounds = 0;

        while (rounds < MAX_TOOL_ROUNDS) {
          rounds++;

          const response = await client.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 4096,
            system: systemPrompt,
            messages: conversationMessages,
            tools: tools.length > 0 ? tools : undefined,
            stream: true,
          });

          let currentToolUseId = "";
          let currentToolName = "";
          let currentToolInput = "";
          const toolCalls: {
            id: string;
            name: string;
            input: Record<string, unknown>;
          }[] = [];
          let hasToolUse = false;

          for await (const event of response) {
            if (
              event.type === "content_block_start" &&
              event.content_block.type === "tool_use"
            ) {
              hasToolUse = true;
              currentToolUseId = event.content_block.id;
              currentToolName = event.content_block.name;
              currentToolInput = "";

              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ tool_use: { name: currentToolName, status: "started" } })}\n\n`
                )
              );
            } else if (
              event.type === "content_block_delta" &&
              event.delta.type === "input_json_delta"
            ) {
              currentToolInput += event.delta.partial_json;
            } else if (event.type === "content_block_stop" && currentToolUseId) {
              try {
                const parsed = JSON.parse(currentToolInput || "{}");
                toolCalls.push({
                  id: currentToolUseId,
                  name: currentToolName,
                  input: parsed,
                });
              } catch {
                toolCalls.push({
                  id: currentToolUseId,
                  name: currentToolName,
                  input: {},
                });
              }
              currentToolUseId = "";
              currentToolName = "";
              currentToolInput = "";
            } else if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ text: event.delta.text })}\n\n`
                )
              );
            }
          }

          if (!hasToolUse || toolCalls.length === 0) {
            break;
          }

          const assistantContent: Anthropic.ContentBlockParam[] = [];
          const toolResultContent: Anthropic.ToolResultBlockParam[] = [];

          for (const call of toolCalls) {
            assistantContent.push({
              type: "tool_use",
              id: call.id,
              name: call.name,
              input: call.input,
            });

            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ tool_use: { name: call.name, status: "executing" } })}\n\n`
              )
            );

            const result = await executeSlackTool(call.name, call.input);

            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ tool_use: { name: call.name, status: "done" } })}\n\n`
              )
            );

            toolResultContent.push({
              type: "tool_result",
              tool_use_id: call.id,
              content: result,
            });
          }

          conversationMessages.push({
            role: "assistant",
            content: assistantContent,
          });

          conversationMessages.push({
            role: "user",
            content: toolResultContent,
          });
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Stream error";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`)
        );
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
