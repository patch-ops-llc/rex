"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Plus,
  RefreshCw,
  Trash2,
  Sparkles,
  PlayCircle,
  Eye,
  Loader2,
  ExternalLink,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldAlert,
} from "lucide-react";

// ---------- Types ---------------------------------------------------------

interface Connection {
  id: string;
  name: string;
  listId: string;
  isActive: boolean;
  lastSyncAt: string | null;
  createdAt: string;
}

interface Portal {
  id: string;
  name: string;
  portalId: string;
}

interface ClickUpTask {
  id: string;
  name: string;
  description?: string | null;
  text_content?: string | null;
  status?: { status: string; color?: string } | null;
  priority?: { priority: string } | null;
  due_date?: string | null;
  parent?: string | null;
  url?: string;
}

interface PlannedStep {
  intent: string;
  method: string;
  path: string;
  body?: any;
  requiresConfirm?: boolean;
}

interface ExecutionPlan {
  summary: string;
  assumptions: string[];
  risks: string[];
  steps: PlannedStep[];
}

interface StepResult {
  stepIndex: number;
  intent: string;
  method: string;
  path: string;
  status: "ok" | "error" | "skipped" | "blocked" | "dry";
  response?: any;
  errorMessage?: string;
}

interface ExecutionState {
  executionId: string;
  plan: ExecutionPlan;
  results: StepResult[] | null;
  mode: "PLAN" | "DRY_RUN" | "EXECUTE";
  status: string;
}

// ---------- Main view -----------------------------------------------------

interface TaskLabViewProps {
  initialConnections: Connection[];
  portals: Portal[];
}

export function TaskLabView({
  initialConnections,
  portals,
}: TaskLabViewProps) {
  const router = useRouter();
  const [connections, setConnections] = useState<Connection[]>(initialConnections);
  const [activeConnectionId, setActiveConnectionId] = useState<string>(
    initialConnections[0]?.id || ""
  );
  const [activePortalId, setActivePortalId] = useState<string>(
    portals[0]?.id || ""
  );

  const [tasks, setTasks] = useState<ClickUpTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState("");

  const [activeTask, setActiveTask] = useState<ClickUpTask | null>(null);
  const [execution, setExecution] = useState<ExecutionState | null>(null);
  const [executionBusy, setExecutionBusy] = useState<
    "plan" | "dry" | "exec" | null
  >(null);
  const [executionError, setExecutionError] = useState("");
  const [confirmedSteps, setConfirmedSteps] = useState<Set<number>>(new Set());

  const refreshConnections = useCallback(async () => {
    const res = await fetch("/api/task-lab/connections");
    if (res.ok) {
      const data = (await res.json()) as Connection[];
      setConnections(data);
      if (!data.find((c) => c.id === activeConnectionId)) {
        setActiveConnectionId(data[0]?.id || "");
      }
    }
  }, [activeConnectionId]);

  const loadTasks = useCallback(async () => {
    if (!activeConnectionId) return;
    setTasksLoading(true);
    setTasksError("");
    try {
      const res = await fetch(
        `/api/task-lab/connections/${activeConnectionId}/tasks`
      );
      const data = await res.json();
      if (!res.ok) {
        setTasksError(data.error || "Failed to load tasks");
        setTasks([]);
      } else {
        setTasks(data.tasks || []);
      }
    } catch (err: any) {
      setTasksError(err?.message || "Failed to load tasks");
    } finally {
      setTasksLoading(false);
    }
  }, [activeConnectionId]);

  useEffect(() => {
    if (activeConnectionId) loadTasks();
    else setTasks([]);
  }, [activeConnectionId, loadTasks]);

  const activePortal = useMemo(
    () => portals.find((p) => p.id === activePortalId) || null,
    [portals, activePortalId]
  );

  // ----- Plan / Run actions

  async function handlePlan(task: ClickUpTask) {
    if (!activeConnectionId || !activePortalId) {
      setExecutionError("Pick a HubSpot portal first.");
      return;
    }
    setActiveTask(task);
    setExecution(null);
    setExecutionError("");
    setConfirmedSteps(new Set());
    setExecutionBusy("plan");
    try {
      const res = await fetch("/api/task-lab/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId: activeConnectionId,
          clickupTaskId: task.id,
          portalId: activePortalId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setExecutionError(data.error || "Planning failed");
      } else {
        setExecution({
          executionId: data.executionId,
          plan: data.plan,
          results: null,
          mode: "PLAN",
          status: "PENDING",
        });
      }
    } catch (err: any) {
      setExecutionError(err?.message || "Planning failed");
    } finally {
      setExecutionBusy(null);
    }
  }

  async function handleRun(mode: "DRY_RUN" | "EXECUTE") {
    if (!execution) return;
    setExecutionBusy(mode === "DRY_RUN" ? "dry" : "exec");
    setExecutionError("");
    try {
      const res = await fetch(
        `/api/task-lab/executions/${execution.executionId}/run`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode,
            confirmedSteps: Array.from(confirmedSteps),
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setExecutionError(data.error || "Execution failed");
      } else {
        setExecution({
          ...execution,
          mode,
          status: data.status,
          results: data.results,
        });
      }
    } catch (err: any) {
      setExecutionError(err?.message || "Execution failed");
    } finally {
      setExecutionBusy(null);
    }
  }

  function toggleConfirm(stepIndex: number) {
    setConfirmedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepIndex)) next.delete(stepIndex);
      else next.add(stepIndex);
      return next;
    });
  }

  // ---------------------------------------------------------------------
  return (
    <div className="space-y-6">
      <ConnectionsCard
        connections={connections}
        activeConnectionId={activeConnectionId}
        onActiveChange={setActiveConnectionId}
        onConnectionsChanged={refreshConnections}
      />

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Tasks</CardTitle>
            <CardDescription>
              {activeConnectionId
                ? `Loaded from ClickUp list ${connections.find((c) => c.id === activeConnectionId)?.listId || ""}`
                : "Pick a ClickUp connection above to load tasks."}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <PortalPicker
              portals={portals}
              value={activePortalId}
              onChange={setActivePortalId}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={loadTasks}
              disabled={!activeConnectionId || tasksLoading}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${tasksLoading ? "animate-spin" : ""}`}
              />
              Reload
            </Button>
            <AddTaskDialog
              connectionId={activeConnectionId}
              onCreated={loadTasks}
            />
          </div>
        </CardHeader>
        <CardContent>
          {tasksError && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950 px-4 py-3 text-sm text-red-800 dark:text-red-200 mb-4">
              {tasksError}
            </div>
          )}
          {!activeConnectionId ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No ClickUp connection selected.
            </p>
          ) : tasksLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Loading tasks…
            </p>
          ) : tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No tasks in this list.
            </p>
          ) : (
            <TaskTable
              tasks={tasks}
              connectionId={activeConnectionId}
              activeTaskId={activeTask?.id || null}
              hasPortal={!!activePortalId}
              onPlan={handlePlan}
              onChanged={loadTasks}
            />
          )}
        </CardContent>
      </Card>

      <ExecutionPanel
        task={activeTask}
        portal={activePortal}
        execution={execution}
        busy={executionBusy}
        error={executionError}
        confirmedSteps={confirmedSteps}
        onToggleConfirm={toggleConfirm}
        onRun={handleRun}
        onClose={() => {
          setActiveTask(null);
          setExecution(null);
          setExecutionError("");
          setConfirmedSteps(new Set());
        }}
      />
    </div>
  );
}

// ---------- Sub-components ------------------------------------------------

function PortalPicker({
  portals,
  value,
  onChange,
}: {
  portals: Portal[];
  value: string;
  onChange: (v: string) => void;
}) {
  if (portals.length === 0) {
    return (
      <Badge variant="destructive" className="h-9 px-3">
        No active HubSpot portals — add one in Settings
      </Badge>
    );
  }
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[260px]">
        <SelectValue placeholder="Pick a HubSpot portal" />
      </SelectTrigger>
      <SelectContent>
        {portals.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name} ({p.portalId})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ConnectionsCard({
  connections,
  activeConnectionId,
  onActiveChange,
  onConnectionsChanged,
}: {
  connections: Connection[];
  activeConnectionId: string;
  onActiveChange: (id: string) => void;
  onConnectionsChanged: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle>ClickUp Connections</CardTitle>
          <CardDescription>
            Each connection is a (token, list ID) pair. Token is encrypted at
            rest. You can have many.
          </CardDescription>
        </div>
        <AddConnectionDialog onCreated={onConnectionsChanged} />
      </CardHeader>
      <CardContent>
        {connections.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No ClickUp connections yet. Add one to start loading tasks.
          </p>
        ) : (
          <div className="space-y-2">
            {connections.map((c) => (
              <div
                key={c.id}
                className={`flex items-center justify-between rounded-lg border p-3 ${
                  c.id === activeConnectionId
                    ? "border-primary/50 bg-primary/5"
                    : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    checked={c.id === activeConnectionId}
                    onChange={() => onActiveChange(c.id)}
                    className="h-4 w-4"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{c.name}</span>
                      <Badge variant={c.isActive ? "success" : "destructive"}>
                        {c.isActive ? "Verified" : "Unverified"}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      List: {c.listId}
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    if (!confirm(`Delete connection "${c.name}"?`)) return;
                    await fetch(`/api/task-lab/connections/${c.id}`, {
                      method: "DELETE",
                    });
                    onConnectionsChanged();
                  }}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AddConnectionDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", listId: "", apiToken: "" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/task-lab/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to add connection");
        return;
      }
      setForm({ name: "", listId: "", apiToken: "" });
      setOpen(false);
      onCreated();
    } catch (err: any) {
      setError(err?.message || "Failed to add connection");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Add Connection
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Add ClickUp Connection</DialogTitle>
            <DialogDescription>
              Provide a ClickUp API token (pk_…) and the numeric ID of the list
              you want to manage.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="cu-name">Name</Label>
              <Input
                id="cu-name"
                placeholder="e.g. SalesRabbit Consolidation"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cu-list">List ID</Label>
              <Input
                id="cu-list"
                placeholder="e.g. 901113622547"
                value={form.listId}
                onChange={(e) => setForm((f) => ({ ...f, listId: e.target.value }))}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cu-token">API Token</Label>
              <Input
                id="cu-token"
                type="password"
                placeholder="pk_xxxxx"
                value={form.apiToken}
                onChange={(e) =>
                  setForm((f) => ({ ...f, apiToken: e.target.value }))
                }
                required
              />
              <p className="text-xs text-muted-foreground">
                Encrypted at rest with AES-256-GCM.
              </p>
            </div>
          </div>
          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950 px-4 py-3 text-sm text-red-800 dark:text-red-200 mb-4">
              {error}
            </div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? "Adding…" : "Add Connection"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddTaskDialog({
  connectionId,
  onCreated,
}: {
  connectionId: string;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", markdown_description: "" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!connectionId) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/task-lab/connections/${connectionId}/tasks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create task");
        return;
      }
      setForm({ name: "", markdown_description: "" });
      setOpen(false);
      onCreated();
    } catch (err: any) {
      setError(err?.message || "Failed to create task");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={!connectionId}>
          <Plus className="mr-2 h-4 w-4" />
          New Task
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Create ClickUp Task</DialogTitle>
            <DialogDescription>
              Adds a new task to the active list.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="task-name">Name</Label>
              <Input
                id="task-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="task-desc">Description (markdown)</Label>
              <Textarea
                id="task-desc"
                rows={6}
                value={form.markdown_description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, markdown_description: e.target.value }))
                }
              />
            </div>
          </div>
          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950 px-4 py-3 text-sm text-red-800 dark:text-red-200 mb-4">
              {error}
            </div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TaskTable({
  tasks,
  connectionId,
  activeTaskId,
  hasPortal,
  onPlan,
  onChanged,
}: {
  tasks: ClickUpTask[];
  connectionId: string;
  activeTaskId: string | null;
  hasPortal: boolean;
  onPlan: (task: ClickUpTask) => void;
  onChanged: () => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Task</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Priority</th>
            <th className="px-3 py-2 font-medium">Due</th>
            <th className="px-3 py-2 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr
              key={t.id}
              className={`border-t ${
                t.id === activeTaskId ? "bg-primary/5" : ""
              }`}
            >
              <td className="px-3 py-2">
                <div className="font-medium">{t.name}</div>
                {t.parent && (
                  <div className="text-xs text-muted-foreground">
                    subtask of {t.parent}
                  </div>
                )}
              </td>
              <td className="px-3 py-2">
                {t.status?.status ? (
                  <Badge variant="secondary">{t.status.status}</Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-3 py-2">
                {t.priority?.priority || (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">
                {t.due_date
                  ? new Date(parseInt(t.due_date, 10)).toLocaleDateString()
                  : "—"}
              </td>
              <td className="px-3 py-2 text-right">
                <div className="flex justify-end gap-1">
                  {t.url && (
                    <a
                      href={t.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
                      title="Open in ClickUp"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => onPlan(t)}
                    disabled={!hasPortal}
                    title={
                      hasPortal
                        ? "Generate AI execution plan"
                        : "Pick a HubSpot portal first"
                    }
                  >
                    <Sparkles className="mr-1 h-3.5 w-3.5" />
                    Plan
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      if (!confirm(`Archive "${t.name}"?`)) return;
                      await fetch(
                        `/api/task-lab/connections/${connectionId}/tasks/${t.id}`,
                        { method: "DELETE" }
                      );
                      onChanged();
                    }}
                    title="Archive task"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExecutionPanel({
  task,
  portal,
  execution,
  busy,
  error,
  confirmedSteps,
  onToggleConfirm,
  onRun,
  onClose,
}: {
  task: ClickUpTask | null;
  portal: Portal | null;
  execution: ExecutionState | null;
  busy: "plan" | "dry" | "exec" | null;
  error: string;
  confirmedSteps: Set<number>;
  onToggleConfirm: (i: number) => void;
  onRun: (mode: "DRY_RUN" | "EXECUTE") => void;
  onClose: () => void;
}) {
  if (!task) return null;

  const requiresConfirmIndices =
    execution?.plan.steps
      .map((s, i) => (s.requiresConfirm ? i : -1))
      .filter((i) => i >= 0) || [];
  const allConfirmed = requiresConfirmIndices.every((i) => confirmedSteps.has(i));

  return (
    <Card className="border-primary/30">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Execution: {task.name}
          </CardTitle>
          <CardDescription>
            {portal ? (
              <>
                Target: <span className="font-medium">{portal.name}</span> (Hub{" "}
                {portal.portalId})
              </>
            ) : (
              "No portal selected"
            )}
          </CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-950 px-4 py-3 text-sm text-red-800 dark:text-red-200">
            {error}
          </div>
        )}

        {busy === "plan" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Asking Rex to draft a plan…
          </div>
        )}

        {execution && (
          <>
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  Summary
                </div>
                <p className="text-sm">{execution.plan.summary}</p>
              </div>
              {execution.plan.assumptions.length > 0 && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                    Assumptions
                  </div>
                  <ul className="text-sm list-disc pl-5 space-y-0.5">
                    {execution.plan.assumptions.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
              {execution.plan.risks.length > 0 && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-amber-700 dark:text-amber-400 mb-1 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Risks
                  </div>
                  <ul className="text-sm list-disc pl-5 space-y-0.5">
                    {execution.plan.risks.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Plan steps ({execution.plan.steps.length})
              </div>
              {execution.plan.steps.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Rex returned no executable steps. See risks/assumptions above.
                </p>
              ) : (
                <ol className="space-y-2">
                  {execution.plan.steps.map((step, i) => {
                    const result = execution.results?.find(
                      (r) => r.stepIndex === i
                    );
                    return (
                      <li
                        key={i}
                        className="rounded-lg border p-3 text-sm space-y-1"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2 flex-1">
                            <span className="text-xs font-mono text-muted-foreground mt-0.5">
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <div className="flex-1">
                              <div className="font-medium">{step.intent}</div>
                              <div className="text-xs font-mono text-muted-foreground mt-0.5">
                                <Badge variant="outline" className="mr-1">
                                  {step.method}
                                </Badge>
                                {step.path}
                              </div>
                            </div>
                          </div>
                          <StepStatusBadge result={result} />
                        </div>
                        {step.requiresConfirm && (
                          <label className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 mt-2">
                            <input
                              type="checkbox"
                              checked={confirmedSteps.has(i)}
                              onChange={() => onToggleConfirm(i)}
                              className="h-3.5 w-3.5"
                            />
                            <ShieldAlert className="h-3.5 w-3.5" />
                            Requires confirm to run live
                          </label>
                        )}
                        {step.body !== undefined && step.body !== null && (
                          <details className="mt-2">
                            <summary className="text-xs text-muted-foreground cursor-pointer">
                              Request body
                            </summary>
                            <pre className="mt-1 rounded bg-muted/50 p-2 text-xs overflow-x-auto">
                              {JSON.stringify(step.body, null, 2)}
                            </pre>
                          </details>
                        )}
                        {result && (result.response || result.errorMessage) && (
                          <details className="mt-2" open={result.status === "error"}>
                            <summary className="text-xs text-muted-foreground cursor-pointer">
                              Result
                            </summary>
                            {result.errorMessage && (
                              <div className="mt-1 text-xs text-red-700 dark:text-red-400">
                                {result.errorMessage}
                              </div>
                            )}
                            {result.response !== undefined && (
                              <pre className="mt-1 rounded bg-muted/50 p-2 text-xs overflow-x-auto max-h-64 overflow-y-auto">
                                {JSON.stringify(result.response, null, 2)}
                              </pre>
                            )}
                          </details>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>

            <div className="flex items-center gap-2 pt-2 border-t">
              <Button
                variant="outline"
                onClick={() => onRun("DRY_RUN")}
                disabled={busy !== null || execution.plan.steps.length === 0}
              >
                {busy === "dry" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Eye className="mr-2 h-4 w-4" />
                )}
                Dry Run
              </Button>
              <Button
                onClick={() => onRun("EXECUTE")}
                disabled={
                  busy !== null ||
                  execution.plan.steps.length === 0 ||
                  !allConfirmed
                }
                title={
                  !allConfirmed
                    ? "Confirm all destructive steps first"
                    : "Execute plan against live HubSpot"
                }
              >
                {busy === "exec" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <PlayCircle className="mr-2 h-4 w-4" />
                )}
                Execute Live
              </Button>
              {execution.results && (
                <ExecutionResultBadge
                  status={execution.status}
                  mode={execution.mode}
                />
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function StepStatusBadge({ result }: { result?: StepResult }) {
  if (!result) return null;
  if (result.status === "ok") {
    return (
      <Badge variant="success" className="gap-1">
        <CheckCircle2 className="h-3 w-3" /> ok
      </Badge>
    );
  }
  if (result.status === "dry") {
    return (
      <Badge variant="secondary" className="gap-1">
        <Eye className="h-3 w-3" /> dry
      </Badge>
    );
  }
  if (result.status === "error") {
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3 w-3" /> error
      </Badge>
    );
  }
  if (result.status === "blocked") {
    return (
      <Badge variant="destructive" className="gap-1">
        <ShieldAlert className="h-3 w-3" /> blocked
      </Badge>
    );
  }
  return <Badge variant="secondary">{result.status}</Badge>;
}

function ExecutionResultBadge({
  status,
  mode,
}: {
  status: string;
  mode: string;
}) {
  if (status === "SUCCESS") {
    return (
      <Badge variant="success" className="ml-2 gap-1">
        <CheckCircle2 className="h-3 w-3" />
        {mode === "DRY_RUN" ? "Dry run OK" : "Live execute OK"}
      </Badge>
    );
  }
  if (status === "FAILED") {
    return (
      <Badge variant="destructive" className="ml-2">
        Failed
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="ml-2">
      {status}
    </Badge>
  );
}
