import { NextRequest, NextResponse } from "next/server";
import { prisma, decrypt } from "@rex/shared";
import {
  executePlan,
  type ExecutionPlan,
  type StepResult,
} from "@/lib/task-lab-ai";
import { loadConnection, updateTask } from "@/lib/clickup";

/**
 * POST /api/task-lab/executions/:id/run
 * Body: { mode: "DRY_RUN" | "EXECUTE", confirmedSteps?: number[] }
 *
 * Runs the previously generated plan. DRY_RUN never touches the portal.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const mode = body?.mode === "EXECUTE" ? "EXECUTE" : "DRY_RUN";
    const confirmedSteps: number[] = Array.isArray(body?.confirmedSteps)
      ? body.confirmedSteps
      : [];
    const markComplete = body?.markComplete === true;

    const execution = await prisma.taskExecution.findUnique({
      where: { id: params.id },
    });
    if (!execution) {
      return NextResponse.json(
        { error: "Execution not found" },
        { status: 404 }
      );
    }
    if (!execution.plan) {
      return NextResponse.json(
        { error: "Execution has no plan to run" },
        { status: 400 }
      );
    }

    const portal = await prisma.hubSpotPortal.findUnique({
      where: { id: execution.portalId },
    });
    if (!portal) {
      return NextResponse.json({ error: "Portal not found" }, { status: 404 });
    }

    let accessToken = "";
    if (mode === "EXECUTE") {
      try {
        accessToken = decrypt(portal.accessToken);
      } catch (err: any) {
        return NextResponse.json(
          { error: `Failed to decrypt portal token: ${err?.message}` },
          { status: 500 }
        );
      }
    }

    await prisma.taskExecution.update({
      where: { id: execution.id },
      data: { mode, status: "RUNNING", completedAt: null },
    });

    let results: StepResult[] = [];
    try {
      results = await executePlan({
        plan: execution.plan as unknown as ExecutionPlan,
        accessToken,
        dryRun: mode === "DRY_RUN",
        confirmedSteps,
      });
    } catch (err: any) {
      await prisma.taskExecution.update({
        where: { id: execution.id },
        data: {
          status: "FAILED",
          errorMessage: err?.message || "Execution crashed",
          completedAt: new Date(),
        },
      });
      throw err;
    }

    const failed = results.filter((r) => r.status === "error").length;
    const blocked = results.filter((r) => r.status === "blocked").length;
    const ok = results.filter((r) => r.status === "ok").length;
    const dry = results.filter((r) => r.status === "dry").length;

    let finalStatus: "SUCCESS" | "PARTIAL" | "FAILED" = "SUCCESS";
    if (failed > 0 || blocked > 0) {
      finalStatus = ok === 0 && dry === 0 ? "FAILED" : "PARTIAL";
    }

    // Auto-update ClickUp task status if user requested it AND this was a
    // real execute that fully succeeded.
    let clickupUpdate: { ok: boolean; status?: string; error?: string } | null =
      null;
    if (
      markComplete &&
      mode === "EXECUTE" &&
      finalStatus === "SUCCESS"
    ) {
      try {
        const conn = await prisma.clickUpConnection.findUnique({
          where: { id: execution.connectionId },
          select: { completionStatus: true },
        });
        const targetStatus = conn?.completionStatus?.trim();
        if (!targetStatus) {
          clickupUpdate = {
            ok: false,
            error:
              "Connection has no completionStatus configured; skipping ClickUp update.",
          };
        } else {
          const fullConn = await loadConnection(execution.connectionId);
          await updateTask(fullConn, execution.clickupTaskId, {
            status: targetStatus,
          });
          clickupUpdate = { ok: true, status: targetStatus };
        }
      } catch (err: any) {
        clickupUpdate = {
          ok: false,
          error: err?.message || "ClickUp status update failed",
        };
      }
    }

    await prisma.taskExecution.update({
      where: { id: execution.id },
      data: {
        status: finalStatus,
        results: results as any,
        completedAt: new Date(),
      },
    });

    return NextResponse.json({
      executionId: execution.id,
      mode,
      status: finalStatus,
      clickupUpdate,
      summary: {
        total: results.length,
        ok,
        dry,
        failed,
        blocked,
        skipped: results.filter((r) => r.status === "skipped").length,
      },
      results,
    });
  } catch (err: any) {
    console.error("Execution failed:", err);
    return NextResponse.json(
      { error: err?.message || "Execution failed" },
      { status: 500 }
    );
  }
}
