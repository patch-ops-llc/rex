import { NextRequest, NextResponse } from "next/server";
import {
  loadConnection,
  listTasks,
  createTask,
} from "@/lib/clickup";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const conn = await loadConnection(params.id);
    const tasks = await listTasks(conn);
    return NextResponse.json({ tasks });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to load tasks" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { name, markdown_description, parent, priority, due_date } =
      body || {};
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const conn = await loadConnection(params.id);
    const created = await createTask(conn, {
      name,
      markdown_description,
      parent,
      priority,
      due_date,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to create task" },
      { status: 500 }
    );
  }
}
