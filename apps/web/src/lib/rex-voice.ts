import Anthropic from "@anthropic-ai/sdk";
import { prisma, publishCallEvent } from "@rex/shared";
import { outputAudio } from "./recall";

const anthropic = new Anthropic();

const REX_TRIGGER_PATTERNS = [
  /\bhey\s+rex\b/i,
  /\brex[\s,]+can\s+you\b/i,
  /\brex[\s,]+what\b/i,
  /\brex[\s,]+how\b/i,
  /\brex[\s,]+do\s+you\b/i,
  /\brex[\s,]+tell\s+us\b/i,
  /\brex[\s,]+explain\b/i,
  /\brex[\s,]+could\s+you\b/i,
  /\brex[\s,]+would\s+you\b/i,
  /\brex[\s,]+are\s+there\b/i,
  /\brex[\s,]+is\s+there\b/i,
  /\brex[\s,]+should\s+we\b/i,
  /\brex[\s,]+remind\b/i,
  /\brex[\s,]+summarize\b/i,
  /\brex[\s,]+recap\b/i,
];

const VOICE_SYSTEM_PROMPT = `You are Rex, a live AI assistant participating in a discovery call for PatchOps — a consulting firm specializing in CRM implementations, system integrations, and business automation.

Someone on the call just addressed you directly. Generate a concise, natural-sounding spoken response.

Rules:
- Keep it SHORT: 1-3 sentences max. You're speaking into a live call — don't monologue.
- Be conversational and warm but professional
- Answer based on the full transcript context and any engagement/SOW context provided
- If you don't have enough context to answer well, say so briefly and suggest the team can follow up
- Don't use bullet points, markdown, or formatting — this will be read aloud via TTS
- Don't start with "Sure!" or "Great question!" — just answer naturally
- If referencing PatchOps experience, keep it brief (e.g. "We've done similar integrations before" not a whole case study)
- You can reference things discussed earlier in the call`;

// Cooldown to prevent Rex from responding too frequently
let lastResponseTime = 0;
const COOLDOWN_MS = 30_000;

export function isRexDirectedQuestion(text: string): boolean {
  return REX_TRIGGER_PATTERNS.some((pattern) => pattern.test(text));
}

export async function handleRexVoiceResponse(
  callId: string,
  triggerSegmentText: string,
  speaker: string
): Promise<void> {
  const now = Date.now();
  if (now - lastResponseTime < COOLDOWN_MS) {
    console.log(`Rex voice: cooldown active, skipping (${Math.round((COOLDOWN_MS - (now - lastResponseTime)) / 1000)}s remaining)`);
    return;
  }

  const call = await prisma.discoveryCall.findUnique({
    where: { id: callId },
    include: {
      engagement: {
        include: {
          sow: { include: { lineItems: true } },
        },
      },
    },
  });

  if (!call?.recallBotId) {
    console.log("Rex voice: no recallBotId, cannot output audio");
    return;
  }

  if (call.status !== "IN_PROGRESS") return;

  const [segments, insights] = await Promise.all([
    prisma.transcriptSegment.findMany({
      where: { discoveryCallId: callId, isFinal: true },
      orderBy: { startTime: "asc" },
      take: 100,
    }),
    prisma.callInsight.findMany({
      where: { discoveryCallId: callId },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const recentTranscript = segments
    .slice(-30)
    .map((s) => `${s.speaker}: ${s.text}`)
    .join("\n");

  let contextBlock = "";
  if (call.engagement) {
    contextBlock += `\nEngagement: ${call.engagement.name} | Client: ${call.engagement.clientName}`;
    if (call.engagement.industry) contextBlock += ` | Industry: ${call.engagement.industry}`;
    if (call.engagement.hubspotTier) contextBlock += ` | HubSpot: ${call.engagement.hubspotTier}`;

    if (call.engagement.sow?.lineItems.length) {
      contextBlock += "\nSOW workstreams: " +
        call.engagement.sow.lineItems.map((li) => `${li.workstream} (${li.allocatedHours}h)`).join(", ");
    }
  }

  if (insights.length > 0) {
    contextBlock += "\n\nKey insights captured so far:";
    for (const i of insights.slice(-15)) {
      contextBlock += `\n- [${i.type}] ${i.content}`;
    }
  }

  // Generate spoken response via Claude
  let responseText: string;
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      system: VOICE_SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: `${contextBlock}\n\nRecent conversation:\n${recentTranscript}\n\n${speaker} just said: "${triggerSegmentText}"\n\nRespond to their question/request concisely for spoken delivery.`,
      }],
    });

    const content = response.content[0];
    if (content.type !== "text" || !content.text.trim()) {
      console.log("Rex voice: empty response from Claude");
      return;
    }
    responseText = content.text.trim();
  } catch (err) {
    console.error("Rex voice: Claude response generation failed:", err);
    return;
  }

  // Convert to audio via ElevenLabs TTS
  let mp3Base64: string;
  try {
    mp3Base64 = await textToSpeech(responseText);
  } catch (err) {
    console.error("Rex voice: TTS failed:", err);
    return;
  }

  // Play audio into the call via Recall
  try {
    await outputAudio(call.recallBotId, mp3Base64);
    lastResponseTime = Date.now();

    publishCallEvent(callId, {
      type: "voice",
      data: {
        text: responseText,
        triggeredBy: speaker,
        question: triggerSegmentText,
        timestamp: Date.now(),
      },
    });

    console.log(`Rex voice: responded to "${triggerSegmentText.slice(0, 60)}..." (${responseText.length} chars)`);
  } catch (err) {
    console.error("Rex voice: Recall output_audio failed:", err);
  }
}

async function textToSpeech(text: string): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID || "pNInz6obpgDQGcFmaJgB";

  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY not configured");
  }

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_turbo_v2_5",
      voice_settings: {
        stability: 0.6,
        similarity_boost: 0.75,
        style: 0.15,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ElevenLabs TTS error ${res.status}: ${body}`);
  }

  const audioBuffer = await res.arrayBuffer();
  return Buffer.from(audioBuffer).toString("base64");
}
