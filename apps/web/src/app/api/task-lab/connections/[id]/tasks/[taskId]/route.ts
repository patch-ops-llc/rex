import { NextRequest, NextResponse } from "next/server";
import { loadConnection, updateTask, archiveTask } from "@/lib/clickup";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; taskId: string } }
) {
  try {
    const conn = await loadConnection(params.id);
    const body = await request.json();
    const updated = await updateTask(conn, params.taskId, body);
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to update task" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; taskId: string } }
) {
  try {
    const conn = await loadConnection(params.id);
    await archiveTask(conn, params.taskId);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to archive task" },
      { status: 500 }
    );
  }
}
