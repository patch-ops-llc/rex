import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";
import { createBot, getBot, detectPlatform } from "@/lib/recall";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { meetingUrl, title } = body;

    if (!meetingUrl) {
      return NextResponse.json(
        { error: "meetingUrl is required" },
        { status: 400 }
      );
    }

    const platform = detectPlatform(meetingUrl);
    if (!platform) {
      return NextResponse.json(
        { error: "Unsupported meeting platform. Use Zoom, Google Meet, or Teams." },
        { status: 400 }
      );
    }

    const engagement = await prisma.engagement.findUnique({
      where: { id: params.id },
      select: { id: true, name: true, clientName: true },
    });

    if (!engagement) {
      return NextResponse.json(
        { error: "Engagement not found" },
        { status: 404 }
      );
    }

    const appUrl = (process.env.WEB_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
    const displayUrl = process.env.DISPLAY_URL;

    if (!appUrl || !appUrl.startsWith("https://")) {
      return NextResponse.json(
        { error: "Server misconfiguration: WEB_URL must be set to a valid HTTPS URL" },
        { status: 500 }
      );
    }

    const discoveryCall = await prisma.discoveryCall.create({
      data: {
        engagementId: params.id,
        meetingUrl,
        platform,
        title: title || `${engagement.clientName} Discovery`,
        status: "WAITING",
      },
    });

    const botConfig: Parameters<typeof createBot>[0] = {
      meeting_url: meetingUrl,
      bot_name: "Rex",
      transcription_options: {
        provider: "meeting_captions",
      },
      real_time_transcription: {
        destination_url: `${appUrl}/api/webhooks/recall`,
        partial_results: true,
      },
      recording_mode: "audio_only",
    };

    if (displayUrl) {
      botConfig.output_media = {
        camera: {
          kind: "webpage",
          config: {
            url: `${displayUrl}/session/${discoveryCall.id}`,
          },
        },
      };
    }

    let recallBot;
    try {
      recallBot = await createBot(botConfig);
    } catch (err) {
      await prisma.discoveryCall.delete({ where: { id: discoveryCall.id } });
      throw err;
    }

    await prisma.discoveryCall.update({
      where: { id: discoveryCall.id },
      data: { recallBotId: recallBot.id },
    });

    const current = await prisma.engagement.findUnique({
      where: { id: params.id },
      select: { status: true },
    });

    if (current?.status === "CREATED" || current?.status === "SCHEDULED") {
      await prisma.engagement.update({
        where: { id: params.id },
        data: { status: "DISCOVERY" },
      });
    }

    return NextResponse.json(
      {
        discoveryCall,
        liveUrl: `/engagements/${params.id}/discovery/${discoveryCall.id}/live`,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Failed to dispatch bot:", error);
    return NextResponse.json(
      { error: error.message || "Failed to dispatch bot" },
      { status: 500 }
    );
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const calls = await prisma.discoveryCall.findMany({
      where: {
        engagementId: params.id,
        recallBotId: { not: null },
      },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { segments: true, insights: true } },
      },
    });

    const callsWithStatus = await Promise.all(
      calls.map(async (call) => {
        if (call.recallBotId && call.status !== "COMPLETED" && call.status !== "FAILED") {
          try {
            const bot = await getBot(call.recallBotId);
            return { ...call, recallStatus: bot.status_changes };
          } catch {
            return call;
          }
        }
        return call;
      })
    );

    return NextResponse.json(callsWithStatus);
  } catch (error) {
    console.error("Failed to fetch bot calls:", error);
    return NextResponse.json(
      { error: "Failed to fetch bot calls" },
      { status: 500 }
    );
  }
}
