import { prisma } from "./db";
import { PHASE_DEFINITIONS, getPhaseDefinition, getNextPhases } from "./types";

/**
 * Pipeline orchestrator — manages the end-to-end engagement lifecycle.
 *
 * Each function is callable independently (modular for testing / midstream
 * application) but they compose into the full SOW → Closeout flow.
 */

// ─── Initialize Pipeline ────────────────────────────────────────────────────

export async function initializePipeline(engagementId: string) {
  const existing = await prisma.projectPhase.findMany({
    where: { engagementId },
  });

  if (existing.length > 0) {
    return existing;
  }

  const phases = await prisma.$transaction(
    PHASE_DEFINITIONS.map((def) =>
      prisma.projectPhase.create({
        data: {
          engagementId,
          phaseType: def.type as any,
          status: "NOT_STARTED",
          displayOrder: def.order,
        },
      })
    )
  );

  await logDelivery(engagementId, "PIPELINE_INITIALIZED", undefined, "system", "Pipeline initialized with all phases");

  return phases;
}

// ─── Start Phase ────────────────────────────────────────────────────────────

export async function startPhase(engagementId: string, phaseType: string) {
  const def = getPhaseDefinition(phaseType);
  if (!def) throw new Error(`Unknown phase type: ${phaseType}`);

  // Check predecessors are complete (or skipped)
  for (const pred of def.predecessors) {
    const predPhase = await prisma.projectPhase.findUnique({
      where: { engagementId_phaseType: { engagementId, phaseType: pred as any } },
    });
    if (!predPhase || (predPhase.status !== "COMPLETED" && predPhase.status !== "SKIPPED")) {
      throw new Error(`Predecessor phase ${pred} is not complete`);
    }
  }

  const phase = await prisma.projectPhase.update({
    where: { engagementId_phaseType: { engagementId, phaseType: phaseType as any } },
    data: {
      status: "IN_PROGRESS",
      startedAt: new Date(),
    },
  });

  // Generate default tasks for this phase
  if (def.defaultTasks.length > 0) {
    const existingTasks = await prisma.projectTask.findMany({
      where: { engagementId, phaseType: phaseType as any },
    });

    if (existingTasks.length === 0) {
      await prisma.$transaction(
        def.defaultTasks.map((task) =>
          prisma.projectTask.create({
            data: {
              engagementId,
              phaseId: phase.id,
              phaseType: phaseType as any,
              title: task.title,
              description: task.description,
              taskType: task.taskType as any,
              status: "PENDING",
              displayOrder: task.order,
            },
          })
        )
      );
    }
  }

  await logDelivery(engagementId, "PHASE_STARTED", phaseType, "system", `Phase started: ${def.label}`);

  return phase;
}

// ─── Complete Phase ─────────────────────────────────────────────────────────

export async function completePhase(
  engagementId: string,
  phaseType: string,
  outputSummary?: Record<string, unknown>
) {
  const def = getPhaseDefinition(phaseType);
  if (!def) throw new Error(`Unknown phase type: ${phaseType}`);

  const phase = await prisma.projectPhase.update({
    where: { engagementId_phaseType: { engagementId, phaseType: phaseType as any } },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      outputSummary: outputSummary ?? undefined,
    },
  });

  await logDelivery(engagementId, "PHASE_COMPLETED", phaseType, "system", `Phase completed: ${def.label}`);

  // Auto-trigger next phases
  const nextPhases = getNextPhases(phaseType);
  for (const next of nextPhases) {
    if (next.autoTrigger) {
      const allPredsComplete = await checkPredecessorsComplete(engagementId, next);
      if (allPredsComplete) {
        await startPhase(engagementId, next.type);
      }
    }
  }

  return phase;
}

// ─── Skip Phase ─────────────────────────────────────────────────────────────

export async function skipPhase(engagementId: string, phaseType: string, reason: string) {
  const def = getPhaseDefinition(phaseType);
  if (!def) throw new Error(`Unknown phase type: ${phaseType}`);

  const phase = await prisma.projectPhase.update({
    where: { engagementId_phaseType: { engagementId, phaseType: phaseType as any } },
    data: {
      status: "SKIPPED",
      completedAt: new Date(),
      outputSummary: { skipped: true, reason },
    },
  });

  // Skip all tasks in this phase
  await prisma.projectTask.updateMany({
    where: { engagementId, phaseType: phaseType as any, status: "PENDING" },
    data: { status: "SKIPPED" },
  });

  await logDelivery(engagementId, "PHASE_SKIPPED", phaseType, "system", `Phase skipped: ${def.label} — ${reason}`);

  // Cascade auto-trigger
  const nextPhases = getNextPhases(phaseType);
  for (const next of nextPhases) {
    if (next.autoTrigger) {
      const allPredsComplete = await checkPredecessorsComplete(engagementId, next);
      if (allPredsComplete) {
        await startPhase(engagementId, next.type);
      }
    }
  }

  return phase;
}

// ─── Task Management ────────────────────────────────────────────────────────

export async function completeTask(taskId: string, outputData?: Record<string, unknown>) {
  const task = await prisma.projectTask.update({
    where: { id: taskId },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      outputData: outputData ?? undefined,
    },
  });

  await logDelivery(task.engagementId, "TASK_COMPLETED", task.phaseType, "system", `Task completed: ${task.title}`);

  // Check if all tasks in the phase are done
  await checkPhaseAutoComplete(task.engagementId, task.phaseType);

  return task;
}

export async function failTask(taskId: string, errorMessage: string) {
  const task = await prisma.projectTask.update({
    where: { id: taskId },
    data: {
      status: "FAILED",
      errorMessage,
      completedAt: new Date(),
    },
  });

  await logDelivery(task.engagementId, "TASK_FAILED", task.phaseType, "system", `Task failed: ${task.title} — ${errorMessage}`);

  // Block the phase
  await prisma.projectPhase.update({
    where: { engagementId_phaseType: { engagementId: task.engagementId, phaseType: task.phaseType } },
    data: { status: "BLOCKED", blockedReason: `Task failed: ${task.title}` },
  });

  return task;
}

export async function addTask(
  engagementId: string,
  phaseType: string,
  title: string,
  description: string,
  taskType: string = "HUMAN"
) {
  const phase = await prisma.projectPhase.findUnique({
    where: { engagementId_phaseType: { engagementId, phaseType: phaseType as any } },
  });

  const existingCount = await prisma.projectTask.count({
    where: { engagementId, phaseType: phaseType as any },
  });

  const task = await prisma.projectTask.create({
    data: {
      engagementId,
      phaseId: phase?.id ?? null,
      phaseType: phaseType as any,
      title,
      description,
      taskType: taskType as any,
      status: "PENDING",
      displayOrder: existingCount,
    },
  });

  await logDelivery(engagementId, "TASK_ADDED", phaseType, "system", `Task added: ${title}`);

  return task;
}

// ─── Pipeline Status ────────────────────────────────────────────────────────

export async function getPipelineStatus(engagementId: string) {
  const phases = await prisma.projectPhase.findMany({
    where: { engagementId },
    orderBy: { displayOrder: "asc" },
    include: {
      tasks: { orderBy: { displayOrder: "asc" } },
    },
  });

  const activePhase = phases.find((p) =>
    ["IN_PROGRESS", "WAITING_ON_CLIENT", "WAITING_ON_APPROVAL", "BLOCKED"].includes(p.status)
  );

  const completedCount = phases.filter((p) => p.status === "COMPLETED" || p.status === "SKIPPED").length;
  const totalTasks = phases.reduce((sum, p) => sum + p.tasks.length, 0);
  const completedTasks = phases.reduce(
    (sum, p) => sum + p.tasks.filter((t) => t.status === "COMPLETED" || t.status === "SKIPPED").length,
    0
  );
  const blockedTasks = phases.reduce(
    (sum, p) => sum + p.tasks.filter((t) => t.status === "FAILED").length,
    0
  );

  return {
    phases,
    activePhase: activePhase ?? null,
    progress: {
      completedPhases: completedCount,
      totalPhases: phases.length,
      completedTasks,
      totalTasks,
      blockedTasks,
      percentComplete: phases.length > 0 ? Math.round((completedCount / phases.length) * 100) : 0,
    },
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function checkPredecessorsComplete(
  engagementId: string,
  phaseDef: { predecessors: string[] }
): Promise<boolean> {
  for (const pred of phaseDef.predecessors) {
    const predPhase = await prisma.projectPhase.findUnique({
      where: { engagementId_phaseType: { engagementId, phaseType: pred as any } },
    });
    if (!predPhase || (predPhase.status !== "COMPLETED" && predPhase.status !== "SKIPPED")) {
      return false;
    }
  }
  return true;
}

async function checkPhaseAutoComplete(engagementId: string, phaseType: string) {
  const tasks = await prisma.projectTask.findMany({
    where: { engagementId, phaseType: phaseType as any },
  });

  if (tasks.length === 0) return;

  const allDone = tasks.every((t) =>
    ["COMPLETED", "SKIPPED"].includes(t.status)
  );

  if (allDone) {
    const phase = await prisma.projectPhase.findUnique({
      where: { engagementId_phaseType: { engagementId, phaseType: phaseType as any } },
    });
    if (phase && phase.status === "IN_PROGRESS") {
      await completePhase(engagementId, phaseType);
    }
  }
}

async function logDelivery(
  engagementId: string,
  action: string,
  phaseType: string | undefined,
  actor: string,
  description: string,
  metadata?: Record<string, unknown>
) {
  await prisma.deliveryLogEntry.create({
    data: {
      engagementId,
      action,
      phaseType: (phaseType as any) ?? null,
      actor,
      description,
      metadata: metadata ?? undefined,
    },
  });
}
