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
  const sessionId: string | undefined = body.sessionId;

  if (!messages.length) {
    return new Response(
      JSON.stringify({ error: "messages array is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Save user message to DB if we have a session
  const lastUserMsg = messages[messages.length - 1];
  if (sessionId && lastUserMsg?.role === "user") {
    const content =
      typeof lastUserMsg.content === "string"
        ? lastUserMsg.content
        : Array.isArray(lastUserMsg.content)
          ? lastUserMsg.content
              .filter((b): b is Anthropic.TextBlockParam => b.type === "text")
              .map((b) => b.text)
              .join("")
          : "";
    try {
      await prisma.chatMessage.create({
        data: { sessionId, role: "user", content },
      });
    } catch (err) {
      console.error("Failed to save user message:", err);
    }
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

  const systemPrompt = `You are REX, PatchOps' AI consulting partner — an expert in RevOps strategy, CRM architecture, system integrations, and business automation.

Your voice is authoritative yet conversational. You think in structured layers — surfacing the strategic "why" before diving into the tactical "how." You draw on real project experience, name specific patterns and tools where relevant, and aren't afraid to flag trade-offs or push back when something doesn't add up.

## Response Style

- **Use rich markdown formatting.** Structure your responses with headers, bullet points, numbered lists, bold emphasis, and code blocks where appropriate. This makes your answers scannable and professional.
- **Lead with insight, not preamble.** Skip generic intros like "Great question!" — get to the substance.
- **Be specific.** Reference corpus entries by name, cite concrete patterns, and give actionable detail. Vague advice is noise.
- **Think in frameworks.** When analyzing a problem, break it into clear dimensions — technical feasibility, business impact, implementation complexity, risk.
- **Use code blocks** for technical examples, field mappings, API patterns, or configuration snippets. Label them with the language.
- **Signal confidence levels.** If something is directly supported by the corpus, say so. If you're extrapolating or reasoning from general expertise, make that clear too.
- **Keep paragraphs tight** — 2-3 sentences max. Dense walls of text are harder to parse than well-structured sections.

${hasSlack ? `## Slack Integration

You have access to ${slackWorkspaceCount} connected Slack workspace${slackWorkspaceCount > 1 ? "s" : ""}. Available capabilities:
- List and browse channels
- Read recent messages and threads
- Search messages by keyword, author, channel, or date
- Send messages and reply to threads
- React to messages
- Look up user profiles

When interacting with Slack:
1. First use \`slack_list_workspaces\` to see available workspaces
2. Use the appropriate tool to fulfill the request
3. Summarize findings in a clear, structured way

**Always confirm with the user before sending messages** unless they explicitly asked you to send something specific.` : ""}

## Knowledge Base

${corpusContext ? `Below is your current corpus of consulting knowledge — discovery calls, project documentation, implementation notes, and artifacts from real engagements:\n\n${corpusContext}` : "The corpus is currently empty. No training data has been ingested yet. Let the user know they can add corpus entries via the Corpus page to unlock knowledge-based answers."}`;

  const client = new Anthropic({ apiKey });
  const tools = hasSlack ? getSlackToolDefinitions() : [];

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      let fullAssistantResponse = "";

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
            max_tokens: 8192,
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
              fullAssistantResponse += event.delta.text;
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

        // Save assistant response to DB
        if (sessionId && fullAssistantResponse) {
          try {
            await prisma.chatMessage.create({
              data: {
                sessionId,
                role: "assistant",
                content: fullAssistantResponse,
              },
            });

            // Auto-title the session from first user message if untitled
            const session = await prisma.chatSession.findUnique({
              where: { id: sessionId },
              select: { title: true },
            });
            if (!session?.title) {
              const firstMsg = await prisma.chatMessage.findFirst({
                where: { sessionId, role: "user" },
                orderBy: { createdAt: "asc" },
              });
              if (firstMsg) {
                const autoTitle =
                  firstMsg.content.length > 60
                    ? firstMsg.content.slice(0, 57) + "..."
                    : firstMsg.content;
                await prisma.chatSession.update({
                  where: { id: sessionId },
                  data: { title: autoTitle },
                });
              }
            }
          } catch (err) {
            console.error("Failed to save assistant message:", err);
          }
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
