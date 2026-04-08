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
        log({ level: "warn", service: SERVICE, message: "file_shared event with no file info", meta: { file_id } });
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
        log({ level: "debug", service: SERVICE, message: "Duplicate file_shared event, skipping", meta: { file_id } });
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

      await client.chat.postMessage({
        channel: channel_id,
        text: `📄 Received *${file.name}* — parsing now...`,
      });

      await prisma.scopeDocument.update({
        where: { id: doc.id },
        data: { status: "PARSING" },
      });

      const rawText = await downloadAndParse(client, file);

      await prisma.scopeDocument.update({
        where: { id: doc.id },
        data: {
          rawText,
          status: "PARSED",
        },
      });

      const charCount = rawText.length;
      const wordCount = rawText.split(/\s+/).filter(Boolean).length;

      await client.chat.postMessage({
        channel: channel_id,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `✅ *${file.name}* processed successfully\n• ${wordCount.toLocaleString()} words extracted\n• ${charCount.toLocaleString()} characters\n• Linked to engagement *${mapping.engagementName}*`,
            },
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `Document ID: \`${doc.id}\` | Type: ${mimeType}`,
              },
            ],
          },
        ],
        text: `Processed ${file.name}: ${wordCount} words extracted.`,
      });

      log({
        level: "info",
        service: SERVICE,
        message: "Scope document ingested",
        engagementId: mapping.engagementId,
        meta: {
          documentId: doc.id,
          fileName: file.name,
          wordCount,
          charCount,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log({ level: "error", service: SERVICE, message: "File processing failed", meta: { file_id, error: message } });

      await prisma.scopeDocument
        .updateMany({
          where: { slackFileId: file_id },
          data: { status: "FAILED", errorMessage: message },
        })
        .catch(() => {});

      await client.chat
        .postMessage({
          channel: channel_id,
          text: `⚠️ Failed to process the uploaded file. Error: ${message}`,
        })
        .catch(() => {});
    }
  });
}

async function downloadAndParse(
  client: any,
  file: any
): Promise<string> {
  const url = file.url_private_download ?? file.url_private;
  if (!url) throw new Error("No download URL available for file");

  const token = (client as any).token;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return extractText(buffer, file.mimetype, file.name);
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
