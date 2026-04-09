import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@rex/shared";
import type { Prisma } from "@prisma/client";
import type { ExtractedInsight, CallProcessingResult } from "@rex/shared";

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are Rex, an AI assistant for PatchOps — a consulting firm specializing in CRM implementations, system integrations, and business automation. You are processing a live discovery call transcript in real-time.

Your job is to extract structured insights from the transcript. For each insight, classify it into one of these types:

- REQUIREMENT: Client needs, must-haves, specifications, desired functionality
- ACTION_ITEM: Follow-ups, tasks someone needs to do, things to research or send
- DECISION: Decisions confirmed or agreed upon during the call
- SCOPE_CONCERN: Potential scope creep, out-of-scope requests, things not in the SOW
- SYSTEM_MENTION: Systems, tools, platforms, integrations, APIs mentioned (e.g. "we use Salesforce", "our ERP is Epicor")
- TIMELINE: Deadlines, milestones, date commitments, go-live targets
- OPEN_QUESTION: Unresolved questions, things needing follow-up or clarification
- STAKEHOLDER_NOTE: Key people mentioned, their roles, decision-making authority, who needs to be involved

Rules:
- Be precise and specific — extract the actual requirement, not a summary of the discussion
- Attribute insights to speakers when possible
- Include approximate timestamp (seconds into the call) when available
- For SCOPE_CONCERN, compare against the SOW context if provided
- For ACTION_ITEM, try to identify the owner (who should do it)
- Don't duplicate insights that were already extracted in previous processing rounds
- Assign a confidence score (0.0-1.0) based on how clearly stated the insight was
- Return valid JSON only

Output format:
{
  "insights": [
    {
      "type": "REQUIREMENT",
      "content": "Client needs automated lead scoring based on website visits and form submissions",
      "speaker": "John (Client)",
      "timestamp": 245.5,
      "confidence": 0.95,
      "metadata": { "category": "marketing_automation", "priority": "high" }
    }
  ],
  "summary": "Brief 1-2 sentence summary of what was discussed in this transcript chunk"
}`;

export async function processTranscriptChunk(
  callId: string,
  isFinal: boolean = false
): Promise<CallProcessingResult> {
  const call = await prisma.discoveryCall.findUnique({
    where: { id: callId },
    include: {
      engagement: {
        include: {
          sow: { include: { lineItems: true } },
          requirementItems: true,
        },
      },
    },
  });

  if (!call) throw new Error("Discovery call not found");

  const existingInsights = await prisma.callInsight.findMany({
    where: { discoveryCallId: callId },
    select: { content: true, type: true },
  });

  const segments = await prisma.transcriptSegment.findMany({
    where: { discoveryCallId: callId },
    orderBy: { startTime: "asc" },
  });

  if (!segments.length) {
    return { insights: [], summary: "No transcript segments to process" };
  }

  const transcriptText = segments
    .map((s) => `[${formatTime(s.startTime)}] ${s.speaker}: ${s.text}`)
    .join("\n");

  let contextBlock = "";

  if (call.engagement) {
    contextBlock += `\n\nENGAGEMENT CONTEXT:
- Client: ${call.engagement.clientName}
- Engagement: ${call.engagement.name}
- Industry: ${call.engagement.industry || "Not specified"}
- HubSpot Tier: ${call.engagement.hubspotTier || "Not specified"}`;

    if (call.engagement.sow) {
      contextBlock += `\n\nSOW WORKSTREAMS:`;
      for (const li of call.engagement.sow.lineItems) {
        contextBlock += `\n- ${li.workstream}: ${li.allocatedHours}h at $${li.hourlyRate}/h${li.description ? ` (${li.description})` : ""}`;
      }
    }

    if (call.engagement.requirementItems.length > 0) {
      contextBlock += `\n\nEXISTING REQUIREMENTS (already captured):`;
      for (const r of call.engagement.requirementItems.slice(0, 20)) {
        contextBlock += `\n- [${r.status}] ${r.question}${r.answer ? `: ${r.answer}` : ""}`;
      }
    }
  }

  if (existingInsights.length > 0) {
    contextBlock += `\n\nALREADY EXTRACTED INSIGHTS (do not duplicate):`;
    for (const i of existingInsights) {
      contextBlock += `\n- [${i.type}] ${i.content}`;
    }
  }

  const userMessage = isFinal
    ? `Process the COMPLETE call transcript below. This is the final processing pass — extract all remaining insights.\n${contextBlock}\n\nFULL TRANSCRIPT:\n${transcriptText}`
    : `Process the latest portion of this ongoing call transcript. Extract any new insights not already captured.\n${contextBlock}\n\nTRANSCRIPT:\n${transcriptText}`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const content = response.content[0];
  if (content.type !== "text") {
    return { insights: [], summary: "No text response from AI" };
  }

  let result: CallProcessingResult;
  try {
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in response");
    result = JSON.parse(jsonMatch[0]);
  } catch {
    console.error("Failed to parse AI response:", content.text);
    return { insights: [], summary: "Failed to parse AI response" };
  }

  const savedInsights = [];
  for (const insight of result.insights || []) {
    const saved = await prisma.callInsight.create({
      data: {
        discoveryCallId: callId,
        type: insight.type as any,
        content: insight.content,
        speaker: insight.speaker || null,
        timestamp: insight.timestamp || null,
        confidence: insight.confidence || null,
        metadata: (insight.metadata as Prisma.InputJsonValue) || undefined,
      },
    });
    savedInsights.push(saved);
  }

  return {
    insights: result.insights || [],
    summary: result.summary,
  };
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
