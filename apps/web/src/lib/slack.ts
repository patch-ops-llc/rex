import { WebClient } from "@slack/web-api";
import { prisma, decrypt } from "@rex/shared";

export function getSlackClient(accessToken: string): WebClient {
  return new WebClient(accessToken);
}

export async function getWorkspaceClient(
  workspaceId: string
): Promise<{ client: WebClient; workspace: { id: string; teamId: string; teamName: string } }> {
  const workspace = await prisma.slackWorkspace.findUnique({
    where: { id: workspaceId },
  });

  if (!workspace || !workspace.isActive) {
    throw new Error(`Slack workspace not found or inactive: ${workspaceId}`);
  }

  const token = decrypt(workspace.accessToken);
  return {
    client: new WebClient(token),
    workspace: { id: workspace.id, teamId: workspace.teamId, teamName: workspace.teamName },
  };
}

export async function getWorkspaceClientByTeamId(
  teamId: string
): Promise<{ client: WebClient; workspace: { id: string; teamId: string; teamName: string } }> {
  const workspace = await prisma.slackWorkspace.findUnique({
    where: { teamId },
  });

  if (!workspace || !workspace.isActive) {
    throw new Error(`Slack workspace not found or inactive for team: ${teamId}`);
  }

  const token = decrypt(workspace.accessToken);
  return {
    client: new WebClient(token),
    workspace: { id: workspace.id, teamId: workspace.teamId, teamName: workspace.teamName },
  };
}

export async function listChannels(
  client: WebClient,
  options: { types?: string; limit?: number; cursor?: string } = {}
) {
  const { types = "public_channel,private_channel", limit = 200, cursor } = options;
  const result = await client.conversations.list({ types, limit, cursor, exclude_archived: true });
  return {
    channels: (result.channels ?? []).map((ch) => ({
      id: ch.id,
      name: ch.name,
      topic: ch.topic?.value,
      purpose: ch.purpose?.value,
      isPrivate: ch.is_private,
      isMember: ch.is_member,
      memberCount: ch.num_members,
    })),
    nextCursor: result.response_metadata?.next_cursor || null,
  };
}

export async function readMessages(
  client: WebClient,
  channelId: string,
  options: { limit?: number; oldest?: string; latest?: string } = {}
) {
  const { limit = 50, oldest, latest } = options;
  const result = await client.conversations.history({
    channel: channelId,
    limit,
    oldest,
    latest,
  });
  return {
    messages: (result.messages ?? []).map((msg) => ({
      ts: msg.ts,
      user: msg.user,
      text: msg.text,
      type: msg.type,
      threadTs: msg.thread_ts,
      replyCount: msg.reply_count,
    })),
    hasMore: result.has_more ?? false,
  };
}

export async function readThread(
  client: WebClient,
  channelId: string,
  threadTs: string,
  options: { limit?: number } = {}
) {
  const { limit = 100 } = options;
  const result = await client.conversations.replies({
    channel: channelId,
    ts: threadTs,
    limit,
  });
  return {
    messages: (result.messages ?? []).map((msg) => ({
      ts: msg.ts,
      user: msg.user,
      text: msg.text,
      type: msg.type,
      threadTs: msg.thread_ts,
    })),
    hasMore: result.has_more ?? false,
  };
}

export async function searchMessages(
  client: WebClient,
  query: string,
  options: { count?: number; sort?: "score" | "timestamp"; sortDir?: "asc" | "desc" } = {}
) {
  const { count = 20, sort = "timestamp", sortDir = "desc" } = options;
  const result = await client.search.messages({
    query,
    count,
    sort,
    sort_dir: sortDir,
  });
  return {
    total: result.messages?.total ?? 0,
    matches: (result.messages?.matches ?? []).map((m) => ({
      text: m.text,
      user: m.username,
      channel: m.channel ? { id: m.channel.id, name: m.channel.name } : null,
      ts: m.ts,
      permalink: m.permalink,
    })),
  };
}

export async function sendMessage(
  client: WebClient,
  channelId: string,
  text: string,
  options: { threadTs?: string } = {}
) {
  const result = await client.chat.postMessage({
    channel: channelId,
    text,
    thread_ts: options.threadTs,
  });
  return {
    ok: result.ok,
    ts: result.ts,
    channel: result.channel,
  };
}

export async function addReaction(
  client: WebClient,
  channelId: string,
  timestamp: string,
  emoji: string
) {
  const result = await client.reactions.add({
    channel: channelId,
    timestamp,
    name: emoji,
  });
  return { ok: result.ok };
}

export async function getUserProfile(client: WebClient, userId: string) {
  const result = await client.users.info({ user: userId });
  const user = result.user;
  return {
    id: user?.id,
    name: user?.name,
    realName: user?.real_name,
    displayName: user?.profile?.display_name,
    email: user?.profile?.email,
    image: user?.profile?.image_72,
    isBot: user?.is_bot,
  };
}

export async function listUsers(
  client: WebClient,
  options: { limit?: number; cursor?: string } = {}
) {
  const { limit = 200, cursor } = options;
  const result = await client.users.list({ limit, cursor });
  return {
    members: (result.members ?? [])
      .filter((u) => !u.deleted && !u.is_bot && u.id !== "USLACKBOT")
      .map((u) => ({
        id: u.id,
        name: u.name,
        realName: u.real_name,
        displayName: u.profile?.display_name,
        email: u.profile?.email,
      })),
    nextCursor: result.response_metadata?.next_cursor || null,
  };
}

export const SLACK_OAUTH_SCOPES = [
  "channels:read",
  "channels:history",
  "groups:read",
  "groups:history",
  "im:read",
  "im:history",
  "mpim:read",
  "mpim:history",
  "chat:write",
  "reactions:write",
  "search:read",
  "users:read",
  "users:read.email",
  "team:read",
].join(",");
