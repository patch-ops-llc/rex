import { App, LogLevel } from "@slack/bolt";
import { log } from "@rex/shared";
import { registerFileHandler } from "./file-handler";

const SERVICE = "client-agent";

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
  logLevel: process.env.NODE_ENV === "production" ? LogLevel.INFO : LogLevel.DEBUG,
});

registerFileHandler(app);

app.event("app_home_opened", async ({ event, client }) => {
  await client.views.publish({
    user_id: event.user,
    view: {
      type: "home",
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: "Rex — Scope Document Ingestion" },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "Upload scope documents (SOWs, proposals, contracts) directly to this channel or DM. Rex will automatically parse them, extract structured scope, and set up your engagement.\n\n*Supported formats:*\n• PDF (.pdf)\n• Word (.docx)\n• Plain text (.txt)\n• Markdown (.md)\n• CSV (.csv)",
          },
        },
        { type: "divider" },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "📄 *How it works:*\n1. Drag & drop a SOW or scope document into this conversation\n2. Rex parses the document and extracts workstreams, hours, rates, and exclusions\n3. A structured SOW is auto-created on your engagement with line items\n4. Out-of-scope items and assumptions are captured for scope creep checks",
          },
        },
      ],
    },
  });
});

app.message(async ({ message, client }) => {
  if (message.subtype === "file_share") return;

  const msg = message as any;
  if (msg.text && !msg.bot_id) {
    await client.reactions.add({
      channel: msg.channel,
      timestamp: msg.ts,
      name: "eyes",
    }).catch(() => {});
  }
});

(async () => {
  const port = parseInt(process.env.PORT ?? "3001", 10);
  await app.start(port);
  log({
    level: "info",
    service: SERVICE,
    message: `Rex client-agent running (socket mode, port ${port})`,
  });
})();
