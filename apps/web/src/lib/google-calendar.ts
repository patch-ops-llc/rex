import { google, calendar_v3 } from "googleapis";
import { prisma, encrypt, decrypt } from "@rex/shared";

const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = `${(process.env.WEB_URL || "").replace(/\/+$/, "")}/api/calendar/callback`;

  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set");
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getAuthUrl(): string {
  const oauth2 = getOAuth2Client();
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });
}

export async function handleCallback(code: string) {
  const oauth2 = getOAuth2Client();
  const { tokens } = await oauth2.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error("Failed to obtain tokens from Google");
  }

  oauth2.setCredentials(tokens);

  const calendarApi = google.calendar({ version: "v3", auth: oauth2 });
  const calList = await calendarApi.calendarList.list();
  const primary = calList.data.items?.find((c) => c.primary);
  const email = primary?.id || "unknown";

  const account = await prisma.calendarAccount.upsert({
    where: { email },
    create: {
      email,
      provider: "GOOGLE",
      accessToken: encrypt(tokens.access_token),
      refreshToken: encrypt(tokens.refresh_token!),
      tokenExpiry: new Date(tokens.expiry_date || Date.now() + 3600_000),
      calendarId: "primary",
    },
    update: {
      accessToken: encrypt(tokens.access_token),
      refreshToken: encrypt(tokens.refresh_token!),
      tokenExpiry: new Date(tokens.expiry_date || Date.now() + 3600_000),
      isActive: true,
    },
  });

  return account;
}

export async function getAuthenticatedClient(accountId: string) {
  const account = await prisma.calendarAccount.findUniqueOrThrow({
    where: { id: accountId },
  });

  const oauth2 = getOAuth2Client();
  oauth2.setCredentials({
    access_token: decrypt(account.accessToken),
    refresh_token: decrypt(account.refreshToken),
    expiry_date: account.tokenExpiry.getTime(),
  });

  oauth2.on("tokens", async (tokens) => {
    const updateData: any = {};
    if (tokens.access_token) {
      updateData.accessToken = encrypt(tokens.access_token);
    }
    if (tokens.expiry_date) {
      updateData.tokenExpiry = new Date(tokens.expiry_date);
    }
    if (Object.keys(updateData).length > 0) {
      await prisma.calendarAccount.update({
        where: { id: accountId },
        data: updateData,
      });
    }
  });

  return { oauth2, account };
}

function extractMeetingUrl(event: calendar_v3.Schema$Event): string | null {
  if (event.hangoutLink) return event.hangoutLink;

  const conferenceData = event.conferenceData;
  if (conferenceData?.entryPoints) {
    const videoEntry = conferenceData.entryPoints.find(
      (ep) => ep.entryPointType === "video"
    );
    if (videoEntry?.uri) return videoEntry.uri;
  }

  const description = event.description || "";
  const body = `${event.summary || ""} ${description} ${event.location || ""}`;
  const urlPatterns = [
    /https:\/\/[\w.-]*zoom\.us\/j\/\S+/i,
    /https:\/\/meet\.google\.com\/[\w-]+/i,
    /https:\/\/teams\.microsoft\.com\/l\/meetup-join\/\S+/i,
  ];

  for (const pattern of urlPatterns) {
    const match = body.match(pattern);
    if (match) return match[0];
  }

  return null;
}

export async function syncUpcomingEvents(accountId: string) {
  const { oauth2, account } = await getAuthenticatedClient(accountId);
  const calendarApi = google.calendar({ version: "v3", auth: oauth2 });

  const now = new Date();
  const lookahead = new Date(now.getTime() + 5 * 60_000);

  const response = await calendarApi.events.list({
    calendarId: account.calendarId,
    timeMin: now.toISOString(),
    timeMax: lookahead.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
  });

  const events = response.data.items || [];
  const results: Array<{ eventId: string; action: string }> = [];

  for (const event of events) {
    if (!event.id) continue;

    if (event.status === "cancelled") continue;

    const meetingUrl = extractMeetingUrl(event);
    if (!meetingUrl) {
      results.push({ eventId: event.id, action: "skipped_no_meeting_url" });
      continue;
    }

    const existing = await prisma.calendarEvent.findUnique({
      where: {
        calendarAccountId_externalEventId: {
          calendarAccountId: accountId,
          externalEventId: event.id,
        },
      },
    });

    if (existing?.botDispatched) {
      results.push({ eventId: event.id, action: "already_dispatched" });
      continue;
    }

    const attendeeEmails = (event.attendees || [])
      .map((a) => a.email)
      .filter(Boolean) as string[];

    const organizerEmail = event.organizer?.email || null;

    const engagementId = await matchEngagement(attendeeEmails);

    const calEvent = await prisma.calendarEvent.upsert({
      where: {
        calendarAccountId_externalEventId: {
          calendarAccountId: accountId,
          externalEventId: event.id,
        },
      },
      create: {
        calendarAccountId: accountId,
        externalEventId: event.id,
        title: event.summary || null,
        meetingUrl,
        startTime: new Date(event.start?.dateTime || event.start?.date || now),
        endTime: new Date(event.end?.dateTime || event.end?.date || now),
        attendeeEmails,
        organizerEmail,
        engagementId,
      },
      update: {
        title: event.summary || null,
        meetingUrl,
        startTime: new Date(event.start?.dateTime || event.start?.date || now),
        endTime: new Date(event.end?.dateTime || event.end?.date || now),
        attendeeEmails,
        organizerEmail,
        engagementId,
      },
    });

    const call = await dispatchBotForEvent(calEvent, meetingUrl, attendeeEmails, engagementId);

    await prisma.calendarEvent.update({
      where: { id: calEvent.id },
      data: { botDispatched: true },
    });

    results.push({
      eventId: event.id,
      action: `bot_dispatched:${call.id}`,
    });
  }

  return results;
}

async function matchEngagement(attendeeEmails: string[]): Promise<string | null> {
  if (attendeeEmails.length === 0) return null;

  const lowerEmails = attendeeEmails.map((e) => e.toLowerCase());

  const contacts = await prisma.engagementContact.findMany({
    where: {
      email: { in: lowerEmails },
    },
    select: { engagementId: true },
  });

  if (contacts.length === 0) return null;

  const counts = new Map<string, number>();
  for (const c of contacts) {
    counts.set(c.engagementId, (counts.get(c.engagementId) || 0) + 1);
  }

  let best = "";
  let bestCount = 0;
  for (const [engId, count] of counts) {
    if (count > bestCount) {
      best = engId;
      bestCount = count;
    }
  }

  return best || null;
}

async function dispatchBotForEvent(
  calEvent: { id: string; title: string | null },
  meetingUrl: string,
  attendeeEmails: string[],
  engagementId: string | null
) {
  const { createBot, detectPlatform } = await import("@/lib/recall");

  const platform = detectPlatform(meetingUrl);
  const appUrl = (process.env.WEB_URL || "").replace(/\/+$/, "");
  const displayUrl = process.env.DISPLAY_URL;

  const call = await prisma.discoveryCall.create({
    data: {
      engagementId,
      calendarEventId: calEvent.id,
      meetingUrl,
      platform,
      title: calEvent.title || "Calendar Meeting",
      status: "WAITING",
      attendeeEmails,
    },
  });

  const SILENT_MP3_B64 =
    "//uQxAAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV";

  const botConfig: Parameters<typeof createBot>[0] = {
    meeting_url: meetingUrl,
    bot_name: "Rex",
    recording_config: {
      transcript: {
        provider: {
          recallai_streaming: {
            mode: "prioritize_low_latency",
            language_code: "en",
          },
        },
      },
      realtime_endpoints: [
        {
          type: "webhook",
          url: `${appUrl}/api/webhooks/recall`,
          events: ["transcript.data", "transcript.partial_data"],
        },
      ],
    },
    automatic_audio_output: {
      in_call_recording: {
        data: { kind: "mp3", b64_data: SILENT_MP3_B64 },
      },
    },
  };

  if (displayUrl) {
    botConfig.output_media = {
      camera: {
        kind: "webpage",
        config: { url: `${displayUrl}/session/${call.id}` },
      },
    };
  }

  try {
    const recallBot = await createBot(botConfig);
    await prisma.discoveryCall.update({
      where: { id: call.id },
      data: { recallBotId: recallBot.id },
    });
  } catch (err) {
    console.error(`Failed to dispatch bot for calendar event ${calEvent.id}:`, err);
    await prisma.discoveryCall.update({
      where: { id: call.id },
      data: { status: "FAILED" },
    });
  }

  return call;
}
