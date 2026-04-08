const RECALL_API_BASE = "https://us-west-2.recall.ai/api/v2";

function getHeaders(): Record<string, string> {
  const key = process.env.RECALL_API_KEY;
  if (!key) throw new Error("RECALL_API_KEY environment variable is not set");
  return {
    Authorization: `Token ${key}`,
    "Content-Type": "application/json",
  };
}

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

export interface RecallBotConfig {
  meeting_url: string;
  bot_name?: string;
  transcription_options?: {
    provider?: string;
  };
  real_time_transcription?: {
    destination_url: string;
    partial_results?: boolean;
  };
  recording_mode?: "speaker_view" | "gallery_view" | "audio_only";
}

export interface RecallBot {
  id: string;
  meeting_url: string;
  status_changes: Array<{
    code: string;
    message: string | null;
    created_at: string;
  }>;
  video_url: string | null;
  recording: string | null;
  media_retention_end: string | null;
}

export interface RecallTranscriptEntry {
  speaker: string;
  words: Array<{
    text: string;
    start_time: number;
    end_time: number;
    confidence?: number;
  }>;
  is_final: boolean;
}

// -----------------------------------------------------------------------
// API Methods
// -----------------------------------------------------------------------

export async function createBot(config: RecallBotConfig): Promise<RecallBot> {
  const res = await fetch(`${RECALL_API_BASE}/bot`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(config),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Recall API error ${res.status}: ${body}`);
  }

  return res.json();
}

export async function getBot(botId: string): Promise<RecallBot> {
  const res = await fetch(`${RECALL_API_BASE}/bot/${botId}`, {
    headers: getHeaders(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Recall API error ${res.status}: ${body}`);
  }

  return res.json();
}

export async function getBotTranscript(botId: string): Promise<RecallTranscriptEntry[]> {
  const res = await fetch(`${RECALL_API_BASE}/bot/${botId}/transcript`, {
    headers: getHeaders(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Recall API error ${res.status}: ${body}`);
  }

  return res.json();
}

export async function removeBot(botId: string): Promise<void> {
  const res = await fetch(`${RECALL_API_BASE}/bot/${botId}/leave_call`, {
    method: "POST",
    headers: getHeaders(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Recall API error ${res.status}: ${body}`);
  }
}

export function detectPlatform(meetingUrl: string): string | null {
  const url = meetingUrl.toLowerCase();
  if (url.includes("zoom.us") || url.includes("zoom.com")) return "zoom";
  if (url.includes("meet.google.com")) return "google_meet";
  if (url.includes("teams.microsoft.com") || url.includes("teams.live.com")) return "teams";
  return null;
}

export function getBotCurrentStatus(bot: RecallBot): string {
  if (!bot.status_changes.length) return "unknown";
  return bot.status_changes[bot.status_changes.length - 1].code;
}
