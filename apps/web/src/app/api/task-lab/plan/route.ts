import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";
import { loadConnection, getTask } from "@/lib/clickup";
import { generatePlan } from "@/lib/task-lab-ai";

/**
 * POST /api/task-lab/plan
 * Body: { connectionId, clickupTaskId, portalId }
 *
 * Pulls the ClickUp task fresh, asks Claude for a HubSpot execution plan,
 * stores it on a TaskExecution row in PLAN status, and returns the plan.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { connectionId, clickupTaskId, portalId } = body || {};
    if (!connectionId || !clickupTaskId || !portalId) {
      return NextResponse.json(
        { error: "connectionId, clickupTaskId, portalId required" },
        { status: 400 }
      );
    }

    const portal = await prisma.hubSpotPortal.findUnique({
      where: { id: portalId },
      select: { id: true, portalId: true, name: true, isActive: true },
    });
    if (!portal) {
      return NextResponse.json({ error: "Portal not found" }, { status: 404 });
    }

    const conn = await loadConnection(connectionId);
    const task = await getTask(conn, clickupTaskId);

    const description =
      (task as any).markdown_description ||
      task.text_content ||
      task.description ||
      "";

    const execution = await prisma.taskExecution.create({
      data: {
        connectionId,
        clickupTaskId,
        clickupListId: conn.listId,
        taskName: task.name,
        taskDescription: description,
        portalId: portal.id,
        hubspotPortalId: portal.portalId,
        mode: "PLAN",
        status: "PLANNING",
      },
    });

    try {
      const plan = await generatePlan({
        taskName: task.name,
        taskDescription: description,
        portalHubId: portal.portalId,
      });

      await prisma.taskExecution.update({
        where: { id: execution.id },
        data: {
          plan: plan as any,
          status: "PENDING",
          completedAt: null,
        },
      });

      return NextResponse.json({
        executionId: execution.id,
        plan,
        portal: { id: portal.id, name: portal.name, hubId: portal.portalId },
      });
    } catch (err: any) {
      await prisma.taskExecution.update({
        where: { id: execution.id },
        data: {
          status: "FAILED",
          errorMessage: err?.message || "Planning failed",
          completedAt: new Date(),
        },
      });
      throw err;
    }
  } catch (err: any) {
    console.error("Plan generation failed:", err);
    return NextResponse.json(
      { error: err?.message || "Plan generation failed" },
      { status: 500 }
    );
  }
}
