import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";
import { loadConnection, listTasks } from "@/lib/clickup";
import { analyzeFeasibility } from "@/lib/task-feasibility";

/**
 * GET  → return cached feasibility verdicts for this connection's tasks
 * POST → run a fresh batched analysis (or just for missing tasks if ?missingOnly=true)
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const rows = await prisma.taskFeasibility.findMany({
      where: { connectionId: params.id },
      select: {
        clickupTaskId: true,
        taskName: true,
        verdict: true,
        confidence: true,
        rationale: true,
        signals: true,
        analyzedAt: true,
      },
    });
    return NextResponse.json({ feasibility: rows });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to load feasibility" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const missingOnly = searchParams.get("missingOnly") === "true";

    const conn = await loadConnection(params.id);
    const tasks = await listTasks(conn);

    let toAnalyze = tasks;
    if (missingOnly) {
      const existing = await prisma.taskFeasibility.findMany({
        where: { connectionId: params.id },
        select: { clickupTaskId: true },
      });
      const existingIds = new Set(existing.map((e) => e.clickupTaskId));
      toAnalyze = tasks.filter((t) => !existingIds.has(t.id));
    }

    if (toAnalyze.length === 0) {
      return NextResponse.json({
        analyzed: 0,
        message: "Nothing to analyze",
      });
    }

    const inputs = toAnalyze.map((t) => ({
      clickupTaskId: t.id,
      name: t.name,
      description:
        (t as any).markdown_description ||
        t.text_content ||
        t.description ||
        "",
    }));

    const results = await analyzeFeasibility(inputs);

    // Upsert each result
    let upserted = 0;
    const taskNameById = new Map(toAnalyze.map((t) => [t.id, t.name]));
    for (const r of results) {
      const taskName = taskNameById.get(r.clickupTaskId) || "(unknown)";
      try {
        await prisma.taskFeasibility.upsert({
          where: {
            connectionId_clickupTaskId: {
              connectionId: params.id,
              clickupTaskId: r.clickupTaskId,
            },
          },
          create: {
            connectionId: params.id,
            clickupTaskId: r.clickupTaskId,
            taskName,
            verdict: r.verdict,
            confidence: r.confidence,
            rationale: r.rationale,
            signals: (r.signals as any) ?? null,
          },
          update: {
            taskName,
            verdict: r.verdict,
            confidence: r.confidence,
            rationale: r.rationale,
            signals: (r.signals as any) ?? null,
            analyzedAt: new Date(),
          },
        });
        upserted++;
      } catch (err) {
        console.error(
          `Feasibility upsert failed for ${r.clickupTaskId}:`,
          err
        );
      }
    }

    const all = await prisma.taskFeasibility.findMany({
      where: { connectionId: params.id },
      select: {
        clickupTaskId: true,
        taskName: true,
        verdict: true,
        confidence: true,
        rationale: true,
        signals: true,
        analyzedAt: true,
      },
    });

    return NextResponse.json({
      analyzed: results.length,
      upserted,
      total: all.length,
      feasibility: all,
    });
  } catch (err: any) {
    console.error("Feasibility analysis failed:", err);
    return NextResponse.json(
      { error: err?.message || "Feasibility analysis failed" },
      { status: 500 }
    );
  }
}
