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
        text: `📄 *${file.name}* parsed (${wordCount.toLocaleString()} words) — extracting scope now...`,
      });

      log({
        level: "info",
        service: SERVICE,
        message: "Scope document ingested, triggering AI processing",
        engagementId: mapping.engagementId,
        meta: { documentId: doc.id, fileName: file.name, wordCount, charCount },
      });

      triggerScopeProcessing(
        mapping.engagementId,
        doc.id,
        file.name,
        channel_id,
        client
      );
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

async function triggerScopeProcessing(
  engagementId: string,
  documentId: string,
  fileName: string,
  channelId: string,
  client: any
) {
  const webUrl = process.env.REX_WEB_URL || "https://rex-web.up.railway.app";
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

    const result = await res.json();
    const workstreamCount = result.parsedData?.workstreams?.length || 0;
    const parts: string[] = [
      `✅ *${fileName}* — scope extracted successfully`,
    ];

    if (workstreamCount > 0) {
      parts.push(`• ${workstreamCount} workstream${workstreamCount !== 1 ? "s" : ""} identified`);
      for (const ws of result.parsedData.workstreams) {
        const hours = ws.allocatedHours ? ` (${ws.allocatedHours}h)` : "";
        parts.push(`  → ${ws.name}${hours}`);
      }
    }

    if (result.parsedData?.totalHours) {
      parts.push(`• ${result.parsedData.totalHours}h total`);
    }

    if (result.parsedData?.outOfScope?.length) {
      parts.push(`• ${result.parsedData.outOfScope.length} out-of-scope item${result.parsedData.outOfScope.length !== 1 ? "s" : ""} captured`);
    }

    if (result.sowCreated) {
      parts.push(`\n📋 SOW auto-created with ${result.lineItemsCreated} workstream${result.lineItemsCreated !== 1 ? "s" : ""}`);
    }

    await client.chat.postMessage({
      channel: channelId,
      text: parts.join("\n"),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log({
      level: "error",
      service: SERVICE,
      message: "Failed to trigger scope processing",
      engagementId,
      meta: { documentId, error: message },
    });

    await client.chat.postMessage({
      channel: channelId,
      text: `⚠️ Parsed *${fileName}* but scope extraction failed: ${message}\nThe raw text is saved — you can retry from the Rex dashboard.`,
    }).catch(() => {});
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
