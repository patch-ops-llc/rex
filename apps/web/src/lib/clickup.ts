import { prisma, decrypt } from "@rex/shared";

const CLICKUP_API = "https://api.clickup.com/api/v2";

export interface ClickUpTask {
  id: string;
  name: string;
  description?: string | null;
  text_content?: string | null;
  status?: { status: string; color?: string } | null;
  priority?: { priority: string; color?: string } | null;
  due_date?: string | null;
  parent?: string | null;
  url?: string;
  date_created?: string;
  date_updated?: string;
  assignees?: Array<{ id: number; username?: string; email?: string }>;
}

export interface ResolvedConnection {
  id: string;
  name: string;
  listId: string;
  apiToken: string; // decrypted, plaintext
  isActive: boolean;
}

export async function loadConnection(
  connectionId: string
): Promise<ResolvedConnection> {
  const conn = await prisma.clickUpConnection.findUnique({
    where: { id: connectionId },
  });
  if (!conn) throw new Error("ClickUp connection not found");
  const apiToken = decrypt(conn.apiToken);
  return {
    id: conn.id,
    name: conn.name,
    listId: conn.listId,
    apiToken,
    isActive: conn.isActive,
  };
}

interface ClickUpFetchOptions {
  method?: string;
  body?: unknown;
}

export async function clickupFetch<T = any>(
  apiToken: string,
  path: string,
  opts: ClickUpFetchOptions = {}
): Promise<T> {
  const { method = "GET", body } = opts;
  const init: RequestInit = {
    method,
    headers: {
      Authorization: apiToken,
      "Content-Type": "application/json",
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);

  const url = `${CLICKUP_API}${path}`;
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`ClickUp ${method} ${path} -> ${res.status}: ${text}`);
  }
  if (res.status === 204) return {} as T;
  return (await res.json()) as T;
}

export async function listTasks(
  conn: ResolvedConnection,
  opts: { includeClosed?: boolean; subtasks?: boolean } = {}
): Promise<ClickUpTask[]> {
  const includeClosed = opts.includeClosed ?? true;
  const subtasks = opts.subtasks ?? true;
  const all: ClickUpTask[] = [];
  let page = 0;
  // ClickUp pages 100 at a time — defensively cap at 5 pages here
  while (page < 5) {
    const params = new URLSearchParams({
      page: String(page),
      include_closed: String(includeClosed),
      subtasks: String(subtasks),
      archived: "false",
    });
    const data = await clickupFetch<{ tasks: ClickUpTask[] }>(
      conn.apiToken,
      `/list/${conn.listId}/task?${params.toString()}`
    );
    const tasks = data.tasks || [];
    all.push(...tasks);
    if (tasks.length < 100) break;
    page++;
  }
  return all;
}

export async function getTask(
  conn: ResolvedConnection,
  taskId: string
): Promise<ClickUpTask> {
  return clickupFetch<ClickUpTask>(conn.apiToken, `/task/${taskId}`);
}

export interface CreateTaskInput {
  name: string;
  markdown_description?: string;
  parent?: string;
  status?: string;
  priority?: number;
  due_date?: number;
}

export async function createTask(
  conn: ResolvedConnection,
  input: CreateTaskInput
): Promise<ClickUpTask> {
  return clickupFetch<ClickUpTask>(
    conn.apiToken,
    `/list/${conn.listId}/task`,
    { method: "POST", body: input }
  );
}

export async function updateTask(
  conn: ResolvedConnection,
  taskId: string,
  patch: Partial<CreateTaskInput> & { archived?: boolean }
): Promise<ClickUpTask> {
  return clickupFetch<ClickUpTask>(conn.apiToken, `/task/${taskId}`, {
    method: "PUT",
    body: patch,
  });
}

export async function archiveTask(
  conn: ResolvedConnection,
  taskId: string
): Promise<void> {
  await clickupFetch(conn.apiToken, `/task/${taskId}`, {
    method: "PUT",
    body: { archived: true },
  });
}
