import { App, LogLevel } from "@slack/bolt";
import { log } from "@rex/shared";
import { registerFileHandler } from "./file-handler";
import { registerMessageHandler } from "./message-handler";

const SERVICE = "client-agent";

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
  logLevel:
    process.env.NODE_ENV === "production" ? LogLevel.INFO : LogLevel.DEBUG,
});

registerFileHandler(app);
registerMessageHandler(app);

app.event("app_home_opened", async ({ event, client }) => {
  await client.views.publish({
    user_id: event.user,
    view: {
      type: "home",
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: "Rex" },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "Your AI RevOps assistant by PatchOps. Ask questions, request changes, and manage your engagement — all from Slack.",
          },
        },
        { type: "divider" },
        {
          type: "header",
          text: { type: "plain_text", text: "What Rex Can Do" },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*Pipeline & Tasks*\n• View pipeline status and tasks across all phases\n• Complete, skip, start, or add tasks\n• Bulk-clear action items or tasks",
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*Engagement Info*\n• Check SOW details and line items\n• View requirements and scope documents\n• Get engagement summary and progress",
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*Discovery*\n• View action items from discovery calls\n• Clear resolved action items",
          },
        },
        { type: "divider" },
        {
          type: "header",
          text: { type: "plain_text", text: "Scope Documents" },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "Upload SOWs, proposals, or contracts directly here. Rex parses them automatically and sets up your engagement scope.\n\n*Supported:* PDF, Word (.docx), Plain text, Markdown, CSV",
          },
        },
        { type: "divider" },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: "Just type a message in any linked channel to get started. Rex will figure out what you need.",
            },
          ],
        },
      ],
    },
  });
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
