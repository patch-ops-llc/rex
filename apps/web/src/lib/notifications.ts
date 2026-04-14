import { prisma, decrypt, log } from "@rex/shared";
import { WebClient } from "@slack/web-api";

async function getEngagementSlackContext(engagementId: string) {
  const mapping = await prisma.clientSlackMapping.findUnique({
    where: { engagementId },
  });
  if (!mapping || !mapping.slackChannelId) return null;

  const workspace = await prisma.slackWorkspace.findFirst({
    where: { teamId: mapping.slackTeamId, isActive: true },
  });
  if (!workspace) return null;

  const token = decrypt(workspace.accessToken);
  return {
    client: new WebClient(token),
    channelId: mapping.slackChannelId,
    teamName: workspace.teamName,
  };
}

async function getInternalSlackClient(): Promise<{
  client: WebClient;
  channelId: string;
} | null> {
  const channelId = process.env.REX_INTERNAL_SLACK_CHANNEL;
  const token = process.env.REX_INTERNAL_SLACK_TOKEN;
  if (!channelId || !token) return null;
  return { client: new WebClient(token), channelId };
}

async function sendSlack(
  client: WebClient,
  channelId: string,
  text: string,
  blocks?: any[],
) {
  try {
    await client.chat.postMessage({ channel: channelId, text, blocks });
  } catch (err: any) {
    log({
      level: "error",
      service: "notifications",
      message: `Slack notification failed: ${err.message}`,
      meta: { channelId },
    });
  }
}

async function sendEmail(
  to: string,
  subject: string,
  body: string,
) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    log({
      level: "warn",
      service: "notifications",
      message: "RESEND_API_KEY not set, skipping email",
      meta: { to, subject },
    });
    return;
  }

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || "Rex <rex@patchops.io>",
        to,
        subject,
        html: body,
      }),
    });
  } catch (err: any) {
    log({
      level: "error",
      service: "notifications",
      message: `Email send failed: ${err.message}`,
      meta: { to, subject },
    });
  }
}

function getEngagementContacts(engagementId: string) {
  return prisma.engagementContact.findMany({
    where: { engagementId },
    select: { email: true, name: true },
  });
}

// ─── Notification Functions ────────────────────────────────────────────────

export async function notifyBuildPlanApproved(
  engagementId: string,
  clientName: string,
  version: number,
) {
  const internal = await getInternalSlackClient();
  if (internal) {
    await sendSlack(
      internal.client,
      internal.channelId,
      `Build plan v${version} approved for *${clientName}*. Ready for implementation.`,
      [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Build Plan Approved* — ${clientName}\nVersion ${version} is approved and ready for HubSpot implementation.\nTrigger execution from the engagement dashboard.`,
          },
        },
      ],
    );
  }

  const clientSlack = await getEngagementSlackContext(engagementId);
  if (clientSlack) {
    await sendSlack(
      clientSlack.client,
      clientSlack.channelId,
      `Your HubSpot build plan (v${version}) has been approved! We'll begin implementation shortly.`,
    );
  }
}

export async function notifyBuildPlanRejected(
  engagementId: string,
  clientName: string,
  version: number,
  reason?: string,
) {
  const internal = await getInternalSlackClient();
  if (internal) {
    await sendSlack(
      internal.client,
      internal.channelId,
      `Build plan v${version} rejected for *${clientName}*${reason ? `: ${reason}` : ""}`,
    );
  }
}

export async function notifyImplementationProgress(
  engagementId: string,
  clientName: string,
  summary: {
    totalSteps: number;
    completedSteps: number;
    failedSteps: number;
    skippedSteps: number;
    humanRequiredCount: number;
  },
) {
  const internal = await getInternalSlackClient();
  if (internal) {
    const statusEmoji = summary.failedSteps === 0 ? ":white_check_mark:" : ":warning:";
    await sendSlack(
      internal.client,
      internal.channelId,
      `${statusEmoji} Implementation complete for *${clientName}*: ` +
        `${summary.completedSteps}/${summary.totalSteps} steps succeeded, ` +
        `${summary.failedSteps} failed, ${summary.skippedSteps} skipped. ` +
        `${summary.humanRequiredCount} items need manual follow-up.`,
      [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text:
              `*Implementation Complete* — ${clientName}\n` +
              `${statusEmoji} ${summary.completedSteps} completed | ` +
              `${summary.failedSteps} failed | ` +
              `${summary.skippedSteps} skipped\n` +
              `*${summary.humanRequiredCount}* items flagged for human action`,
          },
        },
      ],
    );
  }

  const clientSlack = await getEngagementSlackContext(engagementId);
  if (clientSlack) {
    const pct = Math.round((summary.completedSteps / summary.totalSteps) * 100);
    await sendSlack(
      clientSlack.client,
      clientSlack.channelId,
      `HubSpot implementation progress: ${pct}% complete (${summary.completedSteps}/${summary.totalSteps} steps). ` +
        (summary.humanRequiredCount > 0
          ? `${summary.humanRequiredCount} items need your team's attention.`
          : "All automated steps are done!"),
    );
  }
}

export async function notifyTaskAssigned(
  engagementId: string,
  clientName: string,
  taskTitle: string,
  assignee?: string,
  dueAt?: Date,
) {
  const internal = await getInternalSlackClient();
  if (internal) {
    const dueStr = dueAt ? ` (due ${dueAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })})` : "";
    const assignStr = assignee ? ` — assigned to ${assignee}` : "";
    await sendSlack(
      internal.client,
      internal.channelId,
      `:clipboard: *${clientName}*: New task requires action${assignStr}${dueStr}\n> ${taskTitle}`,
    );
  }

  if (assignee) {
    const contacts = await getEngagementContacts(engagementId);
    const contact = contacts.find(
      (c) => c.email && (c.name?.toLowerCase().includes(assignee.toLowerCase()) || c.email.includes(assignee.toLowerCase())),
    );
    if (contact?.email) {
      await sendEmail(
        contact.email,
        `[Rex] Task assigned: ${taskTitle}`,
        `<h2>New Task Assigned</h2>
        <p><strong>${taskTitle}</strong></p>
        <p>Client: ${clientName}</p>
        ${dueAt ? `<p>Due: ${dueAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>` : ""}
        <p>View details in the <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://rex.patchops.io"}/engagements/${engagementId}">Rex dashboard</a>.</p>`,
      );
    }
  }
}

export async function notifyTaskReminder(
  engagementId: string,
  clientName: string,
  tasks: Array<{ title: string; dueAt?: Date | null; assignedTo?: string | null }>,
) {
  const internal = await getInternalSlackClient();
  if (internal) {
    const taskList = tasks
      .map((t) => {
        const due = t.dueAt ? ` (due ${new Date(t.dueAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })})` : "";
        return `• ${t.title}${due}`;
      })
      .join("\n");

    await sendSlack(
      internal.client,
      internal.channelId,
      `:bell: *${clientName}* — ${tasks.length} task(s) need attention:\n${taskList}`,
    );
  }
}

export async function notifyProjectStatusUpdate(
  engagementId: string,
  clientName: string,
  summary: {
    completedPhases: number;
    totalPhases: number;
    percentComplete: number;
    activePhase: string | null;
    pendingHumanTasks: number;
  },
) {
  const clientSlack = await getEngagementSlackContext(engagementId);
  if (clientSlack) {
    const progressBar = buildProgressBar(summary.percentComplete);
    await sendSlack(
      clientSlack.client,
      clientSlack.channelId,
      `*Project Update — ${clientName}*\n` +
        `${progressBar} ${summary.percentComplete}% complete\n` +
        `Phases: ${summary.completedPhases}/${summary.totalPhases} done\n` +
        (summary.activePhase ? `Current: ${summary.activePhase}\n` : "") +
        (summary.pendingHumanTasks > 0
          ? `${summary.pendingHumanTasks} task(s) need your team's input`
          : ""),
    );
  }

  const internal = await getInternalSlackClient();
  if (internal) {
    await sendSlack(
      internal.client,
      internal.channelId,
      `:bar_chart: *${clientName}* — ${summary.percentComplete}% complete (${summary.completedPhases}/${summary.totalPhases} phases). ` +
        (summary.pendingHumanTasks > 0
          ? `${summary.pendingHumanTasks} human tasks pending.`
          : "All on track."),
    );
  }
}

function buildProgressBar(percent: number): string {
  const filled = Math.round(percent / 10);
  const empty = 10 - filled;
  return "[" + "█".repeat(filled) + "░".repeat(empty) + "]";
}
