import { NextRequest, NextResponse } from "next/server";
import { prisma, pipeline } from "@rex/shared";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const tasks = await prisma.projectTask.findMany({
      where: { engagementId: params.id },
      orderBy: [{ phaseType: "asc" }, { displayOrder: "asc" }],
    });
    return NextResponse.json(tasks);
  } catch (error) {
    console.error("Failed to fetch tasks:", error);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
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
    const { action, taskId, phaseType, title, description, taskType, outputData, errorMessage } = body;

    switch (action) {
      case "add": {
        if (!phaseType || !title) {
          return NextResponse.json(
            { error: "phaseType and title are required" },
            { status: 400 }
          );
        }
        const task = await pipeline.addTask(
          params.id,
          phaseType,
          title,
          description || "",
          taskType || "HUMAN"
        );
        return NextResponse.json(task, { status: 201 });
      }
      case "complete": {
        if (!taskId) {
          return NextResponse.json(
            { error: "taskId is required" },
            { status: 400 }
          );
        }
        const task = await pipeline.completeTask(taskId, outputData);
        return NextResponse.json(task);
      }
      case "fail": {
        if (!taskId || !errorMessage) {
          return NextResponse.json(
            { error: "taskId and errorMessage are required" },
            { status: 400 }
          );
        }
        const task = await pipeline.failTask(taskId, errorMessage);
        return NextResponse.json(task);
      }
      case "start": {
        if (!taskId) {
          return NextResponse.json(
            { error: "taskId is required" },
            { status: 400 }
          );
        }
        const task = await prisma.projectTask.update({
          where: { id: taskId },
          data: { status: "IN_PROGRESS", startedAt: new Date() },
        });
        return NextResponse.json(task);
      }
      case "skip": {
        if (!taskId) {
          return NextResponse.json(
            { error: "taskId is required" },
            { status: 400 }
          );
        }
        const task = await prisma.projectTask.update({
          where: { id: taskId },
          data: { status: "SKIPPED", completedAt: new Date() },
        });
        return NextResponse.json(task);
      }
      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error("Task action failed:", error);
    return NextResponse.json(
      { error: error.message || "Task action failed" },
      { status: 500 }
    );
  }
}
