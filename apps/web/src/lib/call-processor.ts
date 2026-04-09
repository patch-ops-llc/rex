import Anthropic from "@anthropic-ai/sdk";
import { prisma, publishCallEvent } from "@rex/shared";
import type { Prisma } from "@prisma/client";
import type { ExtractedInsight, CallProcessingResult, AgendaResolution, CallSuggestion } from "@rex/shared";

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are Rex, an AI assistant for PatchOps \u2014 a consulting firm specializing in CRM implementations, system integrations, and business automation. You are processing a live discovery call transcript in real-time.

Your job is to:
1. Extract structured insights from the transcript
2. Track progress on pre-loaded agenda items (if provided)
3. Generate real-time suggestions \u2014 questions to ask, topics to probe deeper, and coaching tips for the PatchOps consultant running the call

For each insight, classify it into one of these types:

- REQUIREMENT: Client needs, must-haves, specifications, desired functionality
- ACTION_ITEM: Follow-ups, tasks someone needs to do, things to research or send
- DECISION: Decisions confirmed or agreed upon during the call
- SCOPE_CONCERN: Potential scope creep, out-of-scope requests, things not in the SOW
- SYSTEM_MENTION: Systems, tools, platforms, integrations, APIs mentioned (e.g. "we use Salesforce", "our ERP is Epicor")
- TIMELINE: Deadlines, milestones, date commitments, go-live targets
- OPEN_QUESTION: Unresolved questions, things needing follow-up or clarification
- STAKEHOLDER_NOTE: Key people mentioned, their roles, decision-making authority, who needs to be involved

Rules:
- Be precise and specific \u2014 extract the actual requirement, not a summary of the discussion
- Attribute insights to speakers when possible
- Include approximate timestamp (seconds into the call) when available
- For SCOPE_CONCERN, compare against the SOW context if provided
- For ACTION_ITEM, try to identify the owner (who should do it)
- Don't duplicate insights that were already extracted in previous processing rounds
- Assign a confidence score (0.0-1.0) based on how clearly stated the insight was

AGENDA TRACKING:
When agenda items are provided, evaluate whether the transcript discusses any of them.
- Set status to "ACTIVE" if the topic is currently being discussed but not yet fully covered
- Set status to "RESOLVED" if the topic has been thoroughly discussed with clear outcomes
- Set status to "PARTIALLY_RESOLVED" if the topic was touched on but key questions remain
- Write concise enrichment notes summarizing what was learned about each discussed item
- Reference which insights (by their 0-based index in the insights array) relate to the agenda item
- Only include agenda items whose status has changed \u2014 don't repeat items that haven't been discussed

REAL-TIME SUGGESTIONS:
Generate 1-3 contextual suggestions per processing round. These appear on the consultant's screen during the call. Types:

- "question": A specific follow-up question the consultant should ask right now based on what was just discussed. Frame it as a ready-to-read question.
- "coaching_tip": Tactical advice for the consultant (e.g. "The client mentioned Epicor \u2014 ask about their API version, we've seen v10 vs v9 cause issues", "They seem hesitant on timeline \u2014 might be a budget concern")
- "topic_prompt": Nudge to transition to an unresolved agenda topic or probe a gap (e.g. "Good time to ask about their data migration needs", "Circle back to integration requirements before wrapping this topic")

Suggestion rules:
- Make suggestions directly relevant to what's being discussed RIGHT NOW
- Questions should be phrased naturally, ready for the consultant to read aloud
- Include a brief "reasoning" field explaining why you're suggesting this
- Set priority: "high" for things that should be asked before moving on, "medium" for helpful follow-ups, "low" for nice-to-haves
- If an agenda item is relevant, reference its ID in relatedAgendaItemId
- Don't repeat suggestions that would cover ground already discussed
- Keep suggestions concise \u2014 the consultant is reading these mid-conversation

Return valid JSON only.

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
  "agendaUpdates": [
    {
      "agendaItemId": "item_id_here",
      "status": "RESOLVED",
      "notes": "Client confirmed they use Salesforce for CRM. Currently 50 users. Main pain point is lead routing.",
      "relatedInsightIndices": [0, 2]
    }
  ],
  "suggestions": [
    {
      "suggestionType": "question",
      "content": "How many users would need access to the new lead scoring system, and do you have different permission levels?",
      "reasoning": "Client mentioned lead scoring but hasn't specified scale or user access requirements",
      "priority": "high",
      "relatedAgendaItemId": "item_id_or_omit"
    },
    {
      "suggestionType": "coaching_tip",
      "content": "They mentioned Salesforce \u2014 worth asking if this is a migration or coexistence scenario. Big scope difference.",
      "reasoning": "System mention without clarity on whether it's being replaced or integrated",
      "priority": "medium"
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

  const [existingInsights, segments, agendaItems] = await Promise.all([
    prisma.callInsight.findMany({
      where: { discoveryCallId: callId },
      select: { content: true, type: true },
    }),
    prisma.transcriptSegment.findMany({
      where: { discoveryCallId: callId },
      orderBy: { startTime: "asc" },
    }),
    prisma.callAgendaItem.findMany({
      where: { discoveryCallId: callId },
      orderBy: { displayOrder: "asc" },
    }),
  ]);

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

  if (agendaItems.length > 0) {
    contextBlock += `\n\nCALL AGENDA ITEMS (track which are being discussed/resolved):`;
    for (const item of agendaItems) {
      contextBlock += `\n- [${item.id}] (${item.status}) ${item.title}${item.description ? ` \u2014 ${item.description}` : ""}`;
      if (item.notes) {
        contextBlock += `\n  Previous notes: ${item.notes}`;
      }
    }
  }

  const userMessage = isFinal
    ? `Process the COMPLETE call transcript below. This is the final processing pass \u2014 extract all remaining insights and finalize all agenda item statuses. You may omit suggestions on the final pass.\n${contextBlock}\n\nFULL TRANSCRIPT:\n${transcriptText}`
    : `Process the latest portion of this ongoing call transcript. Extract any new insights not already captured, update agenda item statuses, and generate real-time suggestions for the consultant.\n${contextBlock}\n\nTRANSCRIPT:\n${transcriptText}`;

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

  const savedInsights: Array<{ id: string }> = [];
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

  if (result.agendaUpdates?.length) {
    for (const update of result.agendaUpdates) {
      const existing = agendaItems.find((a) => a.id === update.agendaItemId);
      if (!existing) continue;

      const relatedInsightIds = (update.relatedInsightIndices || [])
        .filter((idx) => idx >= 0 && idx < savedInsights.length)
        .map((idx) => savedInsights[idx].id);

      const existingRelated = (existing.relatedInsights as string[]) || [];
      const mergedRelated = [...new Set([...existingRelated, ...relatedInsightIds])];

      const mergedNotes = existing.notes
        ? `${existing.notes}\n${update.notes}`
        : update.notes;

      await prisma.callAgendaItem.update({
        where: { id: update.agendaItemId },
        data: {
          status: update.status as any,
          notes: mergedNotes,
          relatedInsights: mergedRelated as any,
          ...(update.status === "RESOLVED" && !existing.resolvedAt
            ? { resolvedAt: new Date() }
            : {}),
        },
      });
    }
  }

  // Publish suggestions via Redis for real-time delivery to SSE clients
  if (result.suggestions?.length) {
    for (const suggestion of result.suggestions) {
      const suggestionWithId: CallSuggestion = {
        ...suggestion,
        id: `sug_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      };

      publishCallEvent(callId, {
        type: "suggestion",
        data: { suggestion: suggestionWithId },
      });
    }
  }

  return {
    insights: result.insights || [],
    agendaUpdates: result.agendaUpdates,
    suggestions: result.suggestions,
    summary: result.summary,
  };
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
