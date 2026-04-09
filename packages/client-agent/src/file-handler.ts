import type { App } from "@slack/bolt";
import { prisma, log } from "@rex/shared";
import { extractText, isSupportedFileType } from "./file-parser";

const SERVICE = "client-agent";

export function registerFileHandler(app: App) {
  app.event("file_shared", async ({ event, client }) => {
    const { file_id, channel_id, user_id } = event;

    try {
      const fileInfo = await client.files.info({ file: file_id });
      const file = fileInfo.file;

      if (!file || !file.name) {
        log({
          level: "warn",
          service: SERVICE,
          message: "file_shared event with no file info",
          meta: { file_id },
        });
        return;
      }

      const mimeType = file.mimetype ?? "";
      if (!isSupportedFileType(mimeType)) {
        log({
          level: "debug",
          service: SERVICE,
          message: `Ignoring unsupported file type: ${mimeType}`,
          meta: { fileName: file.name, mimeType },
        });
        return;
      }

      const mapping = await resolveEngagement(
        event.channel_id,
        (event as any).team_id ?? (event as any).user_team_id
      );

      if (!mapping) {
        log({
          level: "warn",
          service: SERVICE,
          message: "No engagement mapping for this channel/team",
          meta: { channel_id, file_id },
        });
        return;
      }

      const existingDoc = await prisma.scopeDocument.findUnique({
        where: { slackFileId: file_id },
      });
      if (existingDoc) {
        log({
          level: "debug",
          service: SERVICE,
          message: "Duplicate file_shared event, skipping",
          meta: { file_id },
        });
        return;
      }

      const doc = await prisma.scopeDocument.create({
        data: {
          engagementId: mapping.engagementId,
          fileName: file.name,
          fileType: mimeType,
          fileSizeBytes: file.size ?? null,
          slackFileId: file_id,
          slackChannelId: channel_id,
          slackUserId: user_id,
          status: "UPLOADED",
        },
      });

      const statusMsg = await client.chat.postMessage({
        channel: channel_id,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*${file.name}*\nParsing document...`,
            },
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `Engagement: ${mapping.engagementName}`,
              },
            ],
          },
        ],
        text: `Received ${file.name} — parsing now...`,
      });

      await prisma.scopeDocument.update({
        where: { id: doc.id },
        data: { status: "PARSING" },
      });

      const rawText = await downloadAndParse(client, file);

      await prisma.scopeDocument.update({
        where: { id: doc.id },
        data: { rawText, status: "PARSED" },
      });

      const wordCount = rawText.split(/\s+/).filter(Boolean).length;

      if (statusMsg.ts) {
        await client.chat.update({
          channel: channel_id,
          ts: statusMsg.ts,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*${file.name}*\nParsed (${wordCount.toLocaleString()} words) — extracting scope...`,
              },
            },
            {
              type: "context",
              elements: [
                {
                  type: "mrkdwn",
                  text: `Engagement: ${mapping.engagementName}`,
                },
              ],
            },
          ],
          text: `Parsed ${file.name} (${wordCount.toLocaleString()} words) — extracting scope...`,
        });
      }

      log({
        level: "info",
        service: SERVICE,
        message: "Scope document ingested, triggering AI processing",
        engagementId: mapping.engagementId,
        meta: {
          documentId: doc.id,
          fileName: file.name,
          wordCount,
          charCount: rawText.length,
        },
      });

      triggerScopeProcessing(
        mapping.engagementId,
        mapping.engagementName,
        doc.id,
        file.name,
        channel_id,
        statusMsg.ts ?? undefined,
        client
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log({
        level: "error",
        service: SERVICE,
        message: "File processing failed",
        meta: { file_id, error: message },
      });

      await prisma.scopeDocument
        .updateMany({
          where: { slackFileId: file_id },
          data: { status: "FAILED", errorMessage: message },
        })
        .catch(() => {});

      await client.chat
        .postMessage({
          channel: channel_id,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*Failed to process file*\n${message}`,
              },
            },
          ],
          text: `Failed to process the uploaded file: ${message}`,
        })
        .catch(() => {});
    }
  });
}

async function downloadAndParse(client: any, file: any): Promise<string> {
  const url = file.url_private_download ?? file.url_private;
  if (!url) throw new Error("No download URL available for file");

  const token = (client as any).token;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to download file: ${response.status} ${response.statusText}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return extractText(buffer, file.mimetype, file.name);
}

async function triggerScopeProcessing(
  engagementId: string,
  engagementName: string,
  documentId: string,
  fileName: string,
  channelId: string,
  statusTs: string | undefined,
  client: any
) {
  const webUrl =
    process.env.REX_WEB_URL ||
    "https://display-production-6b60.up.railway.app";
  const apiSecret = process.env.REX_INTERNAL_API_SECRET;

  try {
    const res = await fetch(
      `${webUrl}/api/engagements/${engagementId}/scope-documents/${documentId}/process`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiSecret ? { "x-api-secret": apiSecret } : {}),
        },
      }
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`${res.status}: ${body}`);
    }

    const result: any = await res.json();
    const workstreamCount = result.parsedData?.workstreams?.length || 0;

    const summaryParts: string[] = [`*${fileName}* — scope extracted`];

    if (workstreamCount > 0) {
      summaryParts.push("");
      summaryParts.push(
        `*${workstreamCount} workstream${workstreamCount !== 1 ? "s" : ""}*`
      );
      for (const ws of result.parsedData.workstreams) {
        const hours = ws.allocatedHours ? ` — ${ws.allocatedHours}h` : "";
        summaryParts.push(`  • ${ws.name}${hours}`);
      }
    }

    const metaParts: string[] = [];
    if (result.parsedData?.totalHours) {
      metaParts.push(`${result.parsedData.totalHours}h total`);
    }
    if (result.parsedData?.outOfScope?.length) {
      metaParts.push(
        `${result.parsedData.outOfScope.length} out-of-scope item${result.parsedData.outOfScope.length !== 1 ? "s" : ""}`
      );
    }
    if (result.sowCreated) {
      metaParts.push(
        `SOW created with ${result.lineItemsCreated} line item${result.lineItemsCreated !== 1 ? "s" : ""}`
      );
    }

    const blocks: any[] = [
      {
        type: "section",
        text: { type: "mrkdwn", text: summaryParts.join("\n") },
      },
    ];

    if (metaParts.length > 0) {
      blocks.push({
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: metaParts.join("  |  ") +
              `  |  Engagement: ${engagementName}`,
          },
        ],
      });
    }

    const fallbackText = summaryParts.join("\n");
    if (statusTs) {
      await client.chat.update({
        channel: channelId,
        ts: statusTs,
        blocks,
        text: fallbackText,
      });
    } else {
      await client.chat.postMessage({
        channel: channelId,
        blocks,
        text: fallbackText,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log({
      level: "error",
      service: SERVICE,
      message: "Failed to trigger scope processing",
      engagementId,
      meta: { documentId, error: message },
    });

    const errorBlocks = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${fileName}* — parsed but scope extraction failed\n${message}`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "Raw text is saved — retry from the Rex dashboard",
          },
        ],
      },
    ];

    const fallback = `Parsed ${fileName} but scope extraction failed: ${message}`;
    if (statusTs) {
      await client.chat
        .update({
          channel: channelId,
          ts: statusTs,
          blocks: errorBlocks,
          text: fallback,
        })
        .catch(() => {});
    } else {
      await client.chat
        .postMessage({
          channel: channelId,
          blocks: errorBlocks,
          text: fallback,
        })
        .catch(() => {});
    }
  }
}

interface EngagementMapping {
  engagementId: string;
  engagementName: string;
}

async function resolveEngagement(
  channelId: string,
  teamId?: string
): Promise<EngagementMapping | null> {
  if (channelId) {
    const byChannel = await prisma.clientSlackMapping.findFirst({
      where: { slackChannelId: channelId },
      include: { engagement: { select: { id: true, name: true } } },
    });
    if (byChannel) {
      return {
        engagementId: byChannel.engagement.id,
        engagementName: byChannel.engagement.name,
      };
    }
  }

  if (teamId) {
    const byTeam = await prisma.clientSlackMapping.findFirst({
      where: { slackTeamId: teamId },
      include: { engagement: { select: { id: true, name: true } } },
    });
    if (byTeam) {
      return {
        engagementId: byTeam.engagement.id,
        engagementName: byTeam.engagement.name,
      };
    }
  }

  return null;
}
