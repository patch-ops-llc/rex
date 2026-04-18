import { prisma } from "@rex/shared";
import { generateBuildPlan } from "@rex/build-plan-generator";

export const BUILD_PLAN_JOB_SOURCE_TYPE = "BuildPlanGenerationJob";
const JOB_STALE_MS = 90_000;

type BuildPlanJobTaskStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";

interface BuildPlanJobOutputData {
  progressPct: number;
  ticker: string;
  stage: string;
  startedAt?: string;
  completedAt?: string;
}

export interface BuildPlanJobSnapshot {
  id: string;
  engagementId: string;
  status: BuildPlanJobTaskStatus;
  progressPct: number;
  ticker: string;
  stage: string;
  errorMessage: string | null;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  isStale: boolean;
}

const runningJobs = new Set<string>();

function normalizeOutputData(raw: unknown): BuildPlanJobOutputData {
  if (!raw || typeof raw !== "object") {
    return {
      progressPct: 0,
      ticker: "Queued for generation",
      stage: "queued",
    };
  }

  const candidate = raw as Partial<BuildPlanJobOutputData>;
  return {
    progressPct:
      typeof candidate.progressPct === "number"
        ? Math.max(0, Math.min(100, Math.round(candidate.progressPct)))
        : 0,
    ticker:
      typeof candidate.ticker === "string" && candidate.ticker.trim().length > 0
        ? candidate.ticker
        : "Generating build plan",
    stage:
      typeof candidate.stage === "string" && candidate.stage.trim().length > 0
        ? candidate.stage
        : "running",
    startedAt: candidate.startedAt,
    completedAt: candidate.completedAt,
  };
}

function toSnapshot(task: {
  id: string;
  engagementId: string;
  status: string;
  outputData: unknown;
  errorMessage: string | null;
  updatedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}): BuildPlanJobSnapshot {
  const output = normalizeOutputData(task.outputData);
  return {
    id: task.id,
    engagementId: task.engagementId,
    status: task.status as BuildPlanJobTaskStatus,
    progressPct: output.progressPct,
    ticker: output.ticker,
    stage: output.stage,
    errorMessage: task.errorMessage,
    updatedAt: task.updatedAt.toISOString(),
    startedAt: task.startedAt?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    isStale:
      task.status === "IN_PROGRESS" &&
      Date.now() - task.updatedAt.getTime() > JOB_STALE_MS,
  };
}

async function updateJobProgress(
  taskId: string,
  data: BuildPlanJobOutputData,
): Promise<void> {
  await prisma.projectTask.update({
    where: { id: taskId },
    data: {
      outputData: data as any,
    },
  });
}

function launchBuildPlanRunner(taskId: string, engagementId: string): void {
  if (runningJobs.has(taskId)) return;
  runningJobs.add(taskId);

  void (async () => {
    const startedAt = new Date();
    let heartbeat: ReturnType<typeof setInterval> | null = null;

    try {
      await prisma.projectTask.update({
        where: { id: taskId },
        data: {
          status: "IN_PROGRESS",
          startedAt,
          completedAt: null,
          errorMessage: null,
          outputData: {
            progressPct: 8,
            ticker: "Collecting discovery context",
            stage: "collecting_context",
            startedAt: startedAt.toISOString(),
          } as any,
        },
      });

      const checkpoints = [
        { progressPct: 22, ticker: "Analyzing discovery insights", stage: "analyzing_insights" },
        { progressPct: 42, ticker: "Mapping requirements to HubSpot architecture", stage: "mapping_requirements" },
        { progressPct: 64, ticker: "Drafting implementation steps and dependencies", stage: "drafting_plan" },
        { progressPct: 82, ticker: "Validating generated plan schema", stage: "validating_plan" },
        { progressPct: 92, ticker: "Finalizing build plan artifacts", stage: "finalizing" },
      ];

      let checkpointIdx = 0;
      heartbeat = setInterval(() => {
        if (checkpointIdx >= checkpoints.length) return;
        const next = checkpoints[checkpointIdx];
        checkpointIdx += 1;
        void updateJobProgress(taskId, {
          ...next,
          startedAt: startedAt.toISOString(),
        });
      }, 3_500);

      const planData = await generateBuildPlan({ engagementId });

      if (heartbeat) clearInterval(heartbeat);

      const completedAt = new Date();
      const completedCallCount = await prisma.discoveryCall.count({
        where: {
          engagementId,
          status: "COMPLETED",
        },
      });

      await prisma.$transaction(async (tx) => {
        const buildPlan = await tx.buildPlan.upsert({
          where: { engagementId },
          update: {
            planData: planData as any,
            version: { increment: 1 },
            status: "DRAFT",
            approvedBy: null,
            approvedAt: null,
          },
          create: {
            engagementId,
            planData: planData as any,
            status: "DRAFT",
          },
          select: { id: true, version: true },
        });

        await tx.engagement.update({
          where: { id: engagementId },
          data: { status: "PLAN_GENERATION" },
        });

        await tx.deliveryLogEntry.create({
          data: {
            engagementId,
            action: "BUILD_PLAN_GENERATED",
            phaseType: "BUILD_PLANNING",
            actor: "rex",
            description: `Build plan v${buildPlan.version} generated from ${completedCallCount} discovery call(s)`,
            metadata: {
              buildPlanId: buildPlan.id,
              version: buildPlan.version,
              source: "job",
              jobTaskId: taskId,
            },
          },
        });

        await tx.projectTask.update({
          where: { id: taskId },
          data: {
            status: "COMPLETED",
            completedAt,
            errorMessage: null,
            outputData: {
              progressPct: 100,
              ticker: "Build plan generated successfully",
              stage: "completed",
              startedAt: startedAt.toISOString(),
              completedAt: completedAt.toISOString(),
            } as any,
          },
        });
      });
    } catch (error) {
      if (heartbeat) clearInterval(heartbeat);
      const message =
        error instanceof Error ? error.message : "Build plan generation failed";

      await prisma.projectTask.update({
        where: { id: taskId },
        data: {
          status: "FAILED",
          errorMessage: message,
          completedAt: new Date(),
          outputData: {
            progressPct: 100,
            ticker: "Build plan generation failed",
            stage: "failed",
            startedAt: startedAt.toISOString(),
            completedAt: new Date().toISOString(),
          } as any,
        },
      });
    } finally {
      runningJobs.delete(taskId);
    }
  })();
}

export async function getBuildPlanJobStatus(
  engagementId: string,
): Promise<BuildPlanJobSnapshot | null> {
  const task = await prisma.projectTask.findFirst({
    where: {
      engagementId,
      sourceType: BUILD_PLAN_JOB_SOURCE_TYPE,
    },
    orderBy: { updatedAt: "desc" },
  });

  if (!task) return null;

  if (
    task.status === "IN_PROGRESS" &&
    Date.now() - task.updatedAt.getTime() > JOB_STALE_MS &&
    !runningJobs.has(task.id)
  ) {
    launchBuildPlanRunner(task.id, engagementId);
  }

  return toSnapshot(task);
}

export async function startBuildPlanJob(
  engagementId: string,
): Promise<BuildPlanJobSnapshot> {
  const engagement = await prisma.engagement.findUnique({
    where: { id: engagementId },
    select: {
      id: true,
      _count: {
        select: {
          discoveryCalls: {
            where: { status: "COMPLETED" },
          },
        },
      },
    } as any,
  });

  if (!engagement) {
    throw new Error("Engagement not found");
  }

  const completedCalls = (engagement as any)._count.discoveryCalls as number;
  if (completedCalls === 0) {
    throw new Error(
      "No completed discovery calls. Complete at least one discovery session first.",
    );
  }

  const existing = await prisma.projectTask.findFirst({
    where: {
      engagementId,
      sourceType: BUILD_PLAN_JOB_SOURCE_TYPE,
      status: { in: ["PENDING", "IN_PROGRESS"] },
    },
    orderBy: { updatedAt: "desc" },
  });

  if (existing) {
    launchBuildPlanRunner(existing.id, engagementId);
    return toSnapshot(existing);
  }

  const task = await prisma.projectTask.create({
    data: {
      engagementId,
      phaseType: "BUILD_PLANNING",
      title: "Generate build plan",
      description: "Asynchronous build plan generation job",
      taskType: "AUTO",
      status: "PENDING",
      sourceType: BUILD_PLAN_JOB_SOURCE_TYPE,
      sourceId: engagementId,
      outputData: {
        progressPct: 0,
        ticker: "Queued for generation",
        stage: "queued",
      } as any,
    },
  });

  launchBuildPlanRunner(task.id, engagementId);
  return toSnapshot(task);
}
