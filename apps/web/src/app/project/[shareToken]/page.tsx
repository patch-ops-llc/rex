import { notFound } from "next/navigation";
import { prisma } from "@rex/shared";
import { PHASE_DEFINITIONS } from "@rex/shared";

const PHASE_LABELS: Record<string, string> = {};
for (const def of PHASE_DEFINITIONS) {
  PHASE_LABELS[def.type] = def.label;
}

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: "bg-emerald-500",
  IN_PROGRESS: "bg-blue-500",
  WAITING_ON_CLIENT: "bg-amber-500",
  WAITING_ON_APPROVAL: "bg-amber-500",
  BLOCKED: "bg-red-500",
  SKIPPED: "bg-slate-400",
  NOT_STARTED: "bg-slate-200 dark:bg-slate-700",
  PENDING: "bg-slate-200 dark:bg-slate-700",
  FAILED: "bg-red-500",
};

const TASK_STATUS_LABELS: Record<string, string> = {
  COMPLETED: "Done",
  IN_PROGRESS: "In Progress",
  PENDING: "To Do",
  SKIPPED: "Skipped",
  FAILED: "Blocked",
};

export default async function PublicProjectPage({
  params,
}: {
  params: { shareToken: string };
}) {
  const engagement = await prisma.engagement.findUnique({
    where: { shareToken: params.shareToken },
    select: {
      name: true,
      clientName: true,
      status: true,
      phases: {
        orderBy: { displayOrder: "asc" },
        include: {
          tasks: { orderBy: { displayOrder: "asc" } },
        },
      },
      implementations: {
        orderBy: { stepOrder: "asc" },
        select: { stepName: true, stepType: true, status: true },
      },
      deliveryLog: {
        orderBy: { createdAt: "desc" },
        take: 15,
        select: { description: true, createdAt: true, actor: true, phaseType: true },
      },
    },
  });

  if (!engagement) notFound();

  const phases = engagement.phases;
  const completedPhases = phases.filter((p: any) =>
    p.status === "COMPLETED" || p.status === "SKIPPED"
  ).length;
  const totalTasks = phases.reduce((s: number, p: any) => s + p.tasks.length, 0);
  const completedTasks = phases.reduce(
    (s: number, p: any) => s + p.tasks.filter((t: any) => t.status === "COMPLETED" || t.status === "SKIPPED").length,
    0,
  );
  const pct = phases.length > 0 ? Math.round((completedPhases / phases.length) * 100) : 0;

  const activePhase = phases.find((p: any) =>
    ["IN_PROGRESS", "WAITING_ON_CLIENT", "WAITING_ON_APPROVAL", "BLOCKED"].includes(p.status)
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="border-b bg-white dark:bg-slate-900 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">{engagement.name}</h1>
            <p className="text-sm text-slate-500">{engagement.clientName}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold text-blue-600">{pct}%</span>
            <span className="text-sm text-slate-500">complete</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-8">
        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-slate-500">
            <span>{completedPhases}/{phases.length} phases</span>
            <span>{completedTasks}/{totalTasks} tasks</span>
          </div>
          <div className="h-3 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-600 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Phase timeline */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Project Phases</h2>
          <div className="space-y-3">
            {phases.map((phase: any) => {
              const label = PHASE_LABELS[phase.phaseType] || phase.phaseType;
              const isActive = phase.id === activePhase?.id;
              const tasks = phase.tasks || [];
              const doneTasks = tasks.filter((t: any) => t.status === "COMPLETED" || t.status === "SKIPPED").length;

              return (
                <div
                  key={phase.id}
                  className={`rounded-lg border p-4 ${
                    isActive ? "border-blue-300 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20" : "bg-white dark:bg-slate-900"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`h-3 w-3 rounded-full ${STATUS_COLORS[phase.status] || "bg-slate-300"}`} />
                      <span className="font-medium text-sm">{label}</span>
                      {isActive && (
                        <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-2 py-0.5 rounded-full">
                          Active
                        </span>
                      )}
                    </div>
                    {tasks.length > 0 && (
                      <span className="text-xs text-slate-500">
                        {doneTasks}/{tasks.length} tasks
                      </span>
                    )}
                  </div>

                  {isActive && tasks.length > 0 && (
                    <div className="mt-3 ml-6 space-y-1.5">
                      {tasks.map((task: any) => (
                        <div key={task.id} className="flex items-center gap-2 text-sm">
                          <div className={`h-2 w-2 rounded-full ${STATUS_COLORS[task.status] || "bg-slate-300"}`} />
                          <span className={task.status === "COMPLETED" ? "text-slate-400 line-through" : ""}>
                            {task.title}
                          </span>
                          <span className="text-xs text-slate-400">
                            {TASK_STATUS_LABELS[task.status] || task.status}
                          </span>
                          {task.taskType === "CLIENT_ACTION" && task.status === "PENDING" && (
                            <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 px-1.5 py-0.5 rounded">
                              Needs your input
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Implementation steps */}
        {engagement.implementations.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">HubSpot Build Progress</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {engagement.implementations.map((step: any, i: number) => (
                <div key={i} className="flex items-center gap-2 rounded border bg-white dark:bg-slate-900 p-2.5 text-sm">
                  <div className={`h-2 w-2 rounded-full ${STATUS_COLORS[step.status] || "bg-slate-300"}`} />
                  <span className="truncate">{step.stepName}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Recent activity */}
        {engagement.deliveryLog.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Recent Activity</h2>
            <div className="space-y-2">
              {engagement.deliveryLog.map((entry: any, i: number) => (
                <div key={i} className="flex items-start gap-3 text-sm py-1.5 border-b last:border-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-slate-700 dark:text-slate-300">{entry.description}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {new Date(entry.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <footer className="pt-8 pb-4 text-center text-xs text-slate-400">
          Powered by <span className="font-semibold text-blue-600">Rex</span> by PatchOps
        </footer>
      </main>
    </div>
  );
}
