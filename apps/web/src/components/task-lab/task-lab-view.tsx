"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  ChevronRight,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Brain,
  HelpCircle,
  HandMetal,
  Bot,
} from "lucide-react";

// ---------- Types ---------------------------------------------------------

interface Connection {
  id: string;
  name: string;
  listId: string;
  completionStatus?: string | null;
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
  autoFixes?: string[];
}

interface ExecutionState {
  executionId: string;
  plan: ExecutionPlan;
  results: StepResult[] | null;
  mode: "PLAN" | "DRY_RUN" | "EXECUTE";
  status: string;
}

// One in-flight or completed plan, keyed by ClickUp task id (one panel per task)
interface PlanState {
  task: ClickUpTask;
  executionId: string | null; // null while initial plan API is in flight
  plan: ExecutionPlan | null;
  results: StepResult[] | null;
  mode: "PLAN" | "DRY_RUN" | "EXECUTE";
  status: string;
  busy: "plan" | "dry" | "exec" | null;
  error: string;
  confirmedSteps: Set<number>;
  markComplete: boolean;
  clickupUpdate?: {
    ok: boolean;
    status?: string;
    error?: string;
  } | null;
}

interface ExecutionHistoryRow {
  id: string;
  clickupTaskId: string;
  taskName: string;
  portalId: string;
  hubspotPortalId: string | null;
  mode: "PLAN" | "DRY_RUN" | "EXECUTE";
  status: string;
  errorMessage?: string | null;
  createdAt: string;
  completedAt: string | null;
}

type FeasibilityVerdict = "AUTOMATABLE" | "PARTIAL" | "HUMAN" | "UNCLEAR";

interface FeasibilityRow {
  clickupTaskId: string;
  taskName: string;
  verdict: FeasibilityVerdict;
  confidence: number;
  rationale: string;
  signals?: { apiAreas?: string[]; blockers?: string[] } | null;
  analyzedAt: string;
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

  const [feasibility, setFeasibility] = useState<Map<string, FeasibilityRow>>(
    new Map()
  );
  const [feasibilityBusy, setFeasibilityBusy] = useState<
    "all" | "missing" | null
  >(null);
  const [feasibilityFilter, setFeasibilityFilter] = useState<
    "ALL" | FeasibilityVerdict | "UNANALYZED"
  >("ALL");

  // Multi-plan state — one entry per task currently being planned/run
  const [plans, setPlans] = useState<PlanState[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(
    new Set()
  );
  const [topError, setTopError] = useState("");
  const executionPanelRef = useRef<HTMLDivElement | null>(null);
  const lastPlanCountRef = useRef(0);

  // History (recent runs across this connection)
  const [history, setHistory] = useState<ExecutionHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Scroll execution panel into view when a new plan is added
  useEffect(() => {
    if (
      plans.length > lastPlanCountRef.current &&
      executionPanelRef.current
    ) {
      executionPanelRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
    lastPlanCountRef.current = plans.length;
  }, [plans.length]);

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

  const loadFeasibility = useCallback(async () => {
    if (!activeConnectionId) {
      setFeasibility(new Map());
      return;
    }
    try {
      const res = await fetch(
        `/api/task-lab/connections/${activeConnectionId}/feasibility`
      );
      if (!res.ok) return;
      const data = await res.json();
      const map = new Map<string, FeasibilityRow>();
      for (const r of data.feasibility || []) map.set(r.clickupTaskId, r);
      setFeasibility(map);
    } catch {
      // ignore
    }
  }, [activeConnectionId]);

  useEffect(() => {
    loadFeasibility();
  }, [loadFeasibility]);

  async function runFeasibility(missingOnly: boolean) {
    if (!activeConnectionId) return;
    setFeasibilityBusy(missingOnly ? "missing" : "all");
    setTopError("");
    try {
      const url = `/api/task-lab/connections/${activeConnectionId}/feasibility${
        missingOnly ? "?missingOnly=true" : ""
      }`;
      const res = await fetch(url, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setTopError(data.error || "Feasibility analysis failed");
      } else {
        const map = new Map<string, FeasibilityRow>();
        for (const r of data.feasibility || []) map.set(r.clickupTaskId, r);
        setFeasibility(map);
      }
    } catch (err: any) {
      setTopError(err?.message || "Feasibility analysis failed");
    } finally {
      setFeasibilityBusy(null);
    }
  }

  const activePortal = useMemo(
    () => portals.find((p) => p.id === activePortalId) || null,
    [portals, activePortalId]
  );

  // ----- History

  const loadHistory = useCallback(async () => {
    if (!activeConnectionId) {
      setHistory([]);
      return;
    }
    setHistoryLoading(true);
    try {
      const res = await fetch(
        `/api/task-lab/executions?connectionId=${activeConnectionId}&limit=50`
      );
      if (res.ok) {
        const data = await res.json();
        setHistory(data.executions || []);
      }
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false);
    }
  }, [activeConnectionId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const historyByTaskId = useMemo(() => {
    const map = new Map<string, ExecutionHistoryRow[]>();
    for (const row of history) {
      const arr = map.get(row.clickupTaskId) || [];
      arr.push(row);
      map.set(row.clickupTaskId, arr);
    }
    return map;
  }, [history]);

  // ----- Plan / Run actions (multi)

  function patchPlan(taskId: string, patch: Partial<PlanState>) {
    setPlans((prev) =>
      prev.map((p) => (p.task.id === taskId ? { ...p, ...patch } : p))
    );
  }

  function removePlan(taskId: string) {
    setPlans((prev) => prev.filter((p) => p.task.id !== taskId));
  }

  function toggleConfirmFor(taskId: string, stepIndex: number) {
    setPlans((prev) =>
      prev.map((p) => {
        if (p.task.id !== taskId) return p;
        const next = new Set(p.confirmedSteps);
        if (next.has(stepIndex)) next.delete(stepIndex);
        else next.add(stepIndex);
        return { ...p, confirmedSteps: next };
      })
    );
  }

  function setMarkCompleteFor(taskId: string, val: boolean) {
    patchPlan(taskId, { markComplete: val });
  }

  async function planOne(task: ClickUpTask): Promise<void> {
    if (!activeConnectionId || !activePortalId) return;

    // If already planned, do nothing (re-planning is rare; just close+re-add).
    setPlans((prev) => {
      if (prev.some((p) => p.task.id === task.id)) return prev;
      return [
        ...prev,
        {
          task,
          executionId: null,
          plan: null,
          results: null,
          mode: "PLAN",
          status: "PENDING",
          busy: "plan",
          error: "",
          confirmedSteps: new Set(),
          markComplete: false,
          clickupUpdate: null,
        },
      ];
    });

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
        patchPlan(task.id, {
          busy: null,
          error: data.error || `Planning failed (HTTP ${res.status})`,
        });
      } else {
        patchPlan(task.id, {
          busy: null,
          executionId: data.executionId,
          plan: data.plan,
          mode: "PLAN",
          status: "PENDING",
        });
      }
    } catch (err: any) {
      patchPlan(task.id, {
        busy: null,
        error: err?.message || "Planning failed (network error)",
      });
    }
  }

  async function handlePlan(task: ClickUpTask) {
    setTopError("");
    if (!activeConnectionId) {
      setTopError("No ClickUp connection selected.");
      return;
    }
    if (!activePortalId) {
      setTopError(
        "Pick a HubSpot portal in the Tasks card before planning a task."
      );
      return;
    }
    await planOne(task);
  }

  async function handlePlanSelected() {
    setTopError("");
    if (!activeConnectionId) {
      setTopError("No ClickUp connection selected.");
      return;
    }
    if (!activePortalId) {
      setTopError(
        "Pick a HubSpot portal in the Tasks card before planning tasks."
      );
      return;
    }
    if (selectedTaskIds.size === 0) return;

    const selected = tasks.filter((t) => selectedTaskIds.has(t.id));
    setSelectedTaskIds(new Set());
    // Fire all in parallel — Promise.all so the panel re-renders progressively
    // (each planOne updates state independently as it completes).
    await Promise.all(selected.map((t) => planOne(t)));
  }

  async function handleRun(taskId: string, mode: "DRY_RUN" | "EXECUTE") {
    const plan = plans.find((p) => p.task.id === taskId);
    if (!plan || !plan.executionId) return;
    patchPlan(taskId, {
      busy: mode === "DRY_RUN" ? "dry" : "exec",
      error: "",
      clickupUpdate: null,
    });
    try {
      const res = await fetch(
        `/api/task-lab/executions/${plan.executionId}/run`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode,
            confirmedSteps: Array.from(plan.confirmedSteps),
            markComplete: plan.markComplete,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        patchPlan(taskId, {
          busy: null,
          error: data.error || "Execution failed",
        });
      } else {
        patchPlan(taskId, {
          busy: null,
          mode,
          status: data.status,
          results: data.results,
          clickupUpdate: data.clickupUpdate ?? null,
        });
        // Refresh history + tasks (status may have changed)
        loadHistory();
        if (mode === "EXECUTE" && data.clickupUpdate?.ok) loadTasks();
      }
    } catch (err: any) {
      patchPlan(taskId, {
        busy: null,
        error: err?.message || "Execution failed",
      });
    }
  }

  // ----- Selection helpers

  function toggleSelect(taskId: string) {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  function clearSelection() {
    setSelectedTaskIds(new Set());
  }

  function selectAllVisible(ids: string[]) {
    setSelectedTaskIds(new Set(ids));
  }

  const activeConnection = useMemo(
    () => connections.find((c) => c.id === activeConnectionId) || null,
    [connections, activeConnectionId]
  );

  // ---------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {topError && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 px-4 py-3 text-sm text-amber-900 dark:text-amber-100 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{topError}</span>
          </div>
          <button
            type="button"
            className="text-xs text-amber-700 dark:text-amber-300 hover:underline"
            onClick={() => setTopError("")}
          >
            dismiss
          </button>
        </div>
      )}

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
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <PortalPicker
              portals={portals}
              value={activePortalId}
              onChange={setActivePortalId}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => runFeasibility(true)}
              disabled={!activeConnectionId || feasibilityBusy !== null}
              title="Analyze tasks Rex hasn't seen yet"
            >
              {feasibilityBusy === "missing" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Brain className="mr-2 h-4 w-4" />
              )}
              Analyze new
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => runFeasibility(false)}
              disabled={!activeConnectionId || feasibilityBusy !== null}
              title="Re-analyze every task with AI"
            >
              {feasibilityBusy === "all" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Brain className="mr-2 h-4 w-4" />
              )}
              Re-analyze all
            </Button>
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

          {feasibility.size > 0 && (
            <FeasibilityFilterBar
              filter={feasibilityFilter}
              onChange={setFeasibilityFilter}
              counts={summarizeFeasibility(tasks, feasibility)}
            />
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
              hasPortal={!!activePortalId}
              onPlan={handlePlan}
              onChanged={loadTasks}
              feasibility={feasibility}
              feasibilityFilter={feasibilityFilter}
              selectedTaskIds={selectedTaskIds}
              onToggleSelect={toggleSelect}
              onSelectAllVisible={selectAllVisible}
              onClearSelection={clearSelection}
              onPlanSelected={handlePlanSelected}
              activeTaskIds={new Set(plans.map((p) => p.task.id))}
              historyByTaskId={historyByTaskId}
            />
          )}
        </CardContent>
      </Card>

      <div ref={executionPanelRef} className="space-y-4">
        {plans.length > 0 && (
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Active plans ({plans.length})
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPlans([])}
              title="Close all open plans"
            >
              <XCircle className="mr-1.5 h-4 w-4" />
              Close all
            </Button>
          </div>
        )}
        {plans.map((p) => (
          <ExecutionPanel
            key={p.task.id}
            task={p.task}
            portal={activePortal}
            execution={
              p.plan
                ? {
                    executionId: p.executionId || "",
                    plan: p.plan,
                    results: p.results,
                    mode: p.mode,
                    status: p.status,
                  }
                : null
            }
            busy={p.busy}
            error={p.error}
            confirmedSteps={p.confirmedSteps}
            onToggleConfirm={(stepIndex: number) =>
              toggleConfirmFor(p.task.id, stepIndex)
            }
            onRun={(mode) => handleRun(p.task.id, mode)}
            onClose={() => removePlan(p.task.id)}
            connectionCompletionStatus={
              activeConnection?.completionStatus || null
            }
            markComplete={p.markComplete}
            onMarkCompleteChange={(v) => setMarkCompleteFor(p.task.id, v)}
            clickupUpdate={p.clickupUpdate ?? null}
          />
        ))}
      </div>

      <HistoryCard
        history={history}
        loading={historyLoading}
        onRefresh={loadHistory}
        portals={portals}
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
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{c.name}</span>
                      <Badge variant={c.isActive ? "success" : "destructive"}>
                        {c.isActive ? "Verified" : "Unverified"}
                      </Badge>
                      {c.completionStatus ? (
                        <Badge variant="secondary" className="font-mono">
                          ✓ on success → &quot;{c.completionStatus}&quot;
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          no auto-complete
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      List: {c.listId}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <EditConnectionDialog
                    connection={c}
                    onUpdated={onConnectionsChanged}
                  />
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

function EditConnectionDialog({
  connection,
  onUpdated,
}: {
  connection: Connection;
  onUpdated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: connection.name,
    listId: connection.listId,
    completionStatus: connection.completionStatus || "",
  });

  useEffect(() => {
    if (open) {
      setForm({
        name: connection.name,
        listId: connection.listId,
        completionStatus: connection.completionStatus || "",
      });
      setError("");
    }
  }, [open, connection]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/task-lab/connections/${connection.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          listId: form.listId,
          completionStatus: form.completionStatus.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update connection");
        return;
      }
      setOpen(false);
      onUpdated();
    } catch (err: any) {
      setError(err?.message || "Failed to update connection");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" title="Edit connection">
          <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Edit Connection</DialogTitle>
            <DialogDescription>
              Update name, list ID, or the ClickUp status to set on tasks
              after a successful live execute.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="cu-edit-name">Name</Label>
              <Input
                id="cu-edit-name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cu-edit-list">List ID</Label>
              <Input
                id="cu-edit-list"
                value={form.listId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, listId: e.target.value }))
                }
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cu-edit-completion">
                Completion status (optional)
              </Label>
              <Input
                id="cu-edit-completion"
                placeholder="e.g. complete, done, ready for QA"
                value={form.completionStatus}
                onChange={(e) =>
                  setForm((f) => ({ ...f, completionStatus: e.target.value }))
                }
              />
              <p className="text-xs text-muted-foreground">
                When set, Rex will move the ClickUp task to this status after a
                successful live execute (only when the user opts in per run).
                Leave blank to disable. Status name must match exactly what
                exists in your ClickUp list.
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
              {loading ? "Saving…" : "Save"}
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

// Build a parent->children map. Top-level tasks are anything with no parent
// or a parent that isn't present in the loaded list.
function buildTaskTree(tasks: ClickUpTask[]): {
  roots: ClickUpTask[];
  childrenOf: Map<string, ClickUpTask[]>;
} {
  const byId = new Map<string, ClickUpTask>();
  for (const t of tasks) byId.set(t.id, t);

  const childrenOf = new Map<string, ClickUpTask[]>();
  const roots: ClickUpTask[] = [];

  for (const t of tasks) {
    if (t.parent && byId.has(t.parent)) {
      const arr = childrenOf.get(t.parent) || [];
      arr.push(t);
      childrenOf.set(t.parent, arr);
    } else {
      roots.push(t);
    }
  }

  // Stable sort by name within each level (ClickUp returns somewhat random
  // order; this groups TASK-1, TASK-2, ... predictably under their WS parent).
  const sortFn = (a: ClickUpTask, b: ClickUpTask) =>
    a.name.localeCompare(b.name, undefined, { numeric: true });
  roots.sort(sortFn);
  for (const arr of childrenOf.values()) arr.sort(sortFn);

  return { roots, childrenOf };
}

function TaskTable({
  tasks,
  connectionId,
  hasPortal,
  onPlan,
  onChanged,
  feasibility,
  feasibilityFilter,
  selectedTaskIds,
  onToggleSelect,
  onSelectAllVisible,
  onClearSelection,
  onPlanSelected,
  activeTaskIds,
  historyByTaskId,
}: {
  tasks: ClickUpTask[];
  connectionId: string;
  hasPortal: boolean;
  onPlan: (task: ClickUpTask) => void;
  onChanged: () => void;
  feasibility: Map<string, FeasibilityRow>;
  feasibilityFilter: "ALL" | FeasibilityVerdict | "UNANALYZED";
  selectedTaskIds: Set<string>;
  onToggleSelect: (taskId: string) => void;
  onSelectAllVisible: (ids: string[]) => void;
  onClearSelection: () => void;
  onPlanSelected: () => void;
  activeTaskIds: Set<string>;
  historyByTaskId: Map<string, ExecutionHistoryRow[]>;
}) {
  // Apply filter, but always keep ancestors of matching tasks so the tree
  // structure stays intact.
  const filteredTasks = useMemo(() => {
    if (feasibilityFilter === "ALL") return tasks;
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const matchIds = new Set<string>();
    for (const t of tasks) {
      const f = feasibility.get(t.id);
      const matches =
        feasibilityFilter === "UNANALYZED" ? !f : f?.verdict === feasibilityFilter;
      if (matches) matchIds.add(t.id);
    }
    // Walk up parents
    const keep = new Set<string>(matchIds);
    for (const id of matchIds) {
      let cur = byId.get(id);
      while (cur?.parent) {
        const parent = byId.get(cur.parent);
        if (!parent || keep.has(parent.id)) break;
        keep.add(parent.id);
        cur = parent;
      }
    }
    return tasks.filter((t) => keep.has(t.id));
  }, [tasks, feasibility, feasibilityFilter]);

  const { roots, childrenOf } = useMemo(
    () => buildTaskTree(filteredTasks),
    [filteredTasks]
  );

  // Default: every parent expanded
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const ids = new Set<string>();
    for (const r of roots) if (childrenOf.has(r.id)) ids.add(r.id);
    return ids;
  });

  // When the loaded task set changes (reload), make sure newly-loaded parents
  // also start expanded by default. (Don't collapse anything the user expanded.)
  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const r of roots) if (childrenOf.has(r.id)) next.add(r.id);
      return next;
    });
  }, [roots, childrenOf]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const expandAll = () => {
    const ids = new Set<string>();
    for (const id of childrenOf.keys()) ids.add(id);
    setExpanded(ids);
  };
  const collapseAll = () => setExpanded(new Set());

  const totalParents = childrenOf.size;
  const allExpanded =
    totalParents > 0 &&
    Array.from(childrenOf.keys()).every((id) => expanded.has(id));

  const visibleIds = filteredTasks.map((t) => t.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedTaskIds.has(id));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {selectedTaskIds.size > 0 ? (
            <>
              <Badge variant="secondary" className="font-mono">
                {selectedTaskIds.size} selected
              </Badge>
              <Button
                size="sm"
                variant="default"
                onClick={onPlanSelected}
                disabled={!hasPortal}
                title={
                  hasPortal
                    ? "Generate AI execution plans for all selected tasks in parallel"
                    : "Pick a HubSpot portal first"
                }
              >
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                Plan {selectedTaskIds.size} in parallel
              </Button>
              <Button size="sm" variant="ghost" onClick={onClearSelection}>
                Clear
              </Button>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">
              Select rows to plan multiple at once
            </span>
          )}
        </div>
        {totalParents > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={allExpanded ? collapseAll : expandAll}
          >
            {allExpanded ? (
              <>
                <ChevronsDownUp className="mr-1.5 h-3.5 w-3.5" />
                Collapse all
              </>
            ) : (
              <>
                <ChevronsUpDown className="mr-1.5 h-3.5 w-3.5" />
                Expand all
              </>
            )}
          </Button>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium w-10">
                <input
                  type="checkbox"
                  aria-label="Select all visible"
                  checked={allVisibleSelected}
                  onChange={(e) => {
                    if (e.target.checked) onSelectAllVisible(visibleIds);
                    else onClearSelection();
                  }}
                  className="h-4 w-4 cursor-pointer"
                />
              </th>
              <th className="px-3 py-2 font-medium">Task</th>
              <th className="px-3 py-2 font-medium">AI Verdict</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Priority</th>
              <th className="px-3 py-2 font-medium">Due</th>
              <th className="px-3 py-2 font-medium">Runs</th>
              <th className="px-3 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {roots.map((root) => (
              <TaskRowGroup
                key={root.id}
                task={root}
                depth={0}
                childrenOf={childrenOf}
                expanded={expanded}
                onToggle={toggle}
                connectionId={connectionId}
                activeTaskIds={activeTaskIds}
                hasPortal={hasPortal}
                onPlan={onPlan}
                onChanged={onChanged}
                feasibility={feasibility}
                selectedTaskIds={selectedTaskIds}
                onToggleSelect={onToggleSelect}
                historyByTaskId={historyByTaskId}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TaskRowGroup({
  task,
  depth,
  childrenOf,
  expanded,
  onToggle,
  connectionId,
  activeTaskIds,
  hasPortal,
  onPlan,
  onChanged,
  feasibility,
  selectedTaskIds,
  onToggleSelect,
  historyByTaskId,
}: {
  task: ClickUpTask;
  depth: number;
  childrenOf: Map<string, ClickUpTask[]>;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  connectionId: string;
  activeTaskIds: Set<string>;
  hasPortal: boolean;
  onPlan: (task: ClickUpTask) => void;
  onChanged: () => void;
  feasibility: Map<string, FeasibilityRow>;
  selectedTaskIds: Set<string>;
  onToggleSelect: (taskId: string) => void;
  historyByTaskId: Map<string, ExecutionHistoryRow[]>;
}) {
  const children = childrenOf.get(task.id) || [];
  const hasChildren = children.length > 0;
  const isOpen = expanded.has(task.id);
  const verdict = feasibility.get(task.id);
  const isActive = activeTaskIds.has(task.id);
  const isSelected = selectedTaskIds.has(task.id);
  const taskRuns = historyByTaskId.get(task.id) || [];
  const runCount = taskRuns.length;
  const lastRun = taskRuns[0];

  return (
    <>
      <tr
        className={`border-t ${
          isActive ? "bg-primary/5" : ""
        } ${depth === 0 && hasChildren ? "bg-muted/20" : ""}`}
      >
        <td className="px-3 py-2 align-top">
          <input
            type="checkbox"
            aria-label={`Select ${task.name}`}
            checked={isSelected}
            onChange={() => onToggleSelect(task.id)}
            className="h-4 w-4 cursor-pointer mt-1"
          />
        </td>
        <td className="px-3 py-2">
          <div
            className="flex items-start gap-1"
            style={{ paddingLeft: `${depth * 20}px` }}
          >
            {hasChildren ? (
              <button
                type="button"
                onClick={() => onToggle(task.id)}
                className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded hover:bg-accent text-muted-foreground"
                aria-label={isOpen ? "Collapse" : "Expand"}
              >
                {isOpen ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>
            ) : (
              <span className="inline-block h-5 w-5" />
            )}
            <div className="min-w-0">
              <div
                className={`truncate ${
                  depth === 0 ? "font-semibold" : "font-medium"
                }`}
              >
                {task.name}
              </div>
              {hasChildren && (
                <div className="text-xs text-muted-foreground">
                  {children.length} subtask{children.length === 1 ? "" : "s"}
                </div>
              )}
            </div>
          </div>
        </td>
        <td className="px-3 py-2">
          <FeasibilityBadge verdict={verdict} />
        </td>
        <td className="px-3 py-2">
          {task.status?.status ? (
            <Badge variant="secondary">{task.status.status}</Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
        <td className="px-3 py-2">
          {task.priority?.priority || (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
        <td className="px-3 py-2 text-xs text-muted-foreground">
          {task.due_date
            ? new Date(parseInt(task.due_date, 10)).toLocaleDateString()
            : "—"}
        </td>
        <td className="px-3 py-2 text-xs">
          {runCount === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span
              className="inline-flex items-center gap-1 text-muted-foreground"
              title={lastRun ? `Last run: ${lastRun.mode} → ${lastRun.status} on ${new Date(lastRun.createdAt).toLocaleString()}` : ""}
            >
              <RunStatusDot status={lastRun?.status || ""} />
              {runCount} run{runCount === 1 ? "" : "s"}
            </span>
          )}
        </td>
        <td className="px-3 py-2 text-right">
          <div className="flex justify-end gap-1">
            {task.url && (
              <a
                href={task.url}
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
              variant={isActive ? "secondary" : "default"}
              onClick={() => onPlan(task)}
              disabled={!hasPortal || isActive}
              title={
                isActive
                  ? "Plan already open below"
                  : hasPortal
                    ? "Generate AI execution plan"
                    : "Pick a HubSpot portal first"
              }
            >
              <Sparkles className="mr-1 h-3.5 w-3.5" />
              {isActive ? "Open" : "Plan"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                if (!confirm(`Archive "${task.name}"?`)) return;
                await fetch(
                  `/api/task-lab/connections/${connectionId}/tasks/${task.id}`,
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
      {isOpen &&
        children.map((child) => (
          <TaskRowGroup
            key={child.id}
            task={child}
            depth={depth + 1}
            childrenOf={childrenOf}
            expanded={expanded}
            onToggle={onToggle}
            connectionId={connectionId}
            activeTaskIds={activeTaskIds}
            hasPortal={hasPortal}
            onPlan={onPlan}
            onChanged={onChanged}
            feasibility={feasibility}
            selectedTaskIds={selectedTaskIds}
            onToggleSelect={onToggleSelect}
            historyByTaskId={historyByTaskId}
          />
        ))}
    </>
  );
}

function RunStatusDot({ status }: { status: string }) {
  const cls =
    status === "SUCCESS"
      ? "bg-emerald-500"
      : status === "PARTIAL"
        ? "bg-amber-500"
        : status === "FAILED"
          ? "bg-rose-500"
          : status === "RUNNING" || status === "PLANNING"
            ? "bg-sky-500 animate-pulse"
            : "bg-slate-400";
  return <span className={`h-2 w-2 rounded-full inline-block ${cls}`} />;
}

// ---------- Feasibility helpers ------------------------------------------

function summarizeFeasibility(
  tasks: ClickUpTask[],
  feasibility: Map<string, FeasibilityRow>
) {
  let automatable = 0;
  let partial = 0;
  let human = 0;
  let unclear = 0;
  let unanalyzed = 0;
  for (const t of tasks) {
    const f = feasibility.get(t.id);
    if (!f) {
      unanalyzed++;
      continue;
    }
    if (f.verdict === "AUTOMATABLE") automatable++;
    else if (f.verdict === "PARTIAL") partial++;
    else if (f.verdict === "HUMAN") human++;
    else unclear++;
  }
  return {
    ALL: tasks.length,
    AUTOMATABLE: automatable,
    PARTIAL: partial,
    HUMAN: human,
    UNCLEAR: unclear,
    UNANALYZED: unanalyzed,
  };
}

function FeasibilityFilterBar({
  filter,
  onChange,
  counts,
}: {
  filter: "ALL" | FeasibilityVerdict | "UNANALYZED";
  onChange: (v: "ALL" | FeasibilityVerdict | "UNANALYZED") => void;
  counts: Record<string, number>;
}) {
  const pills: { id: typeof filter; label: string; cls: string }[] = [
    {
      id: "ALL",
      label: `All ${counts.ALL}`,
      cls: "bg-muted text-foreground hover:bg-muted/80",
    },
    {
      id: "AUTOMATABLE",
      label: `Automatable ${counts.AUTOMATABLE}`,
      cls: "bg-emerald-100 text-emerald-900 hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-100",
    },
    {
      id: "PARTIAL",
      label: `Partial ${counts.PARTIAL}`,
      cls: "bg-amber-100 text-amber-900 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-100",
    },
    {
      id: "HUMAN",
      label: `Human ${counts.HUMAN}`,
      cls: "bg-rose-100 text-rose-900 hover:bg-rose-200 dark:bg-rose-950 dark:text-rose-100",
    },
    {
      id: "UNCLEAR",
      label: `Unclear ${counts.UNCLEAR}`,
      cls: "bg-slate-100 text-slate-900 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100",
    },
    {
      id: "UNANALYZED",
      label: `Unanalyzed ${counts.UNANALYZED}`,
      cls: "bg-muted text-muted-foreground hover:bg-muted/80",
    },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      {pills.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onChange(p.id)}
          className={`text-xs rounded-full px-3 py-1 border transition ${
            filter === p.id
              ? "ring-2 ring-primary border-primary"
              : "border-transparent"
          } ${p.cls}`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

function FeasibilityBadge({ verdict }: { verdict: FeasibilityRow | undefined }) {
  if (!verdict) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <HelpCircle className="h-3 w-3" />
        Unanalyzed
      </span>
    );
  }
  const cfg: Record<
    FeasibilityVerdict,
    { label: string; cls: string; icon: any }
  > = {
    AUTOMATABLE: {
      label: "Automatable",
      cls: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-100 dark:border-emerald-800",
      icon: Bot,
    },
    PARTIAL: {
      label: "Partial",
      cls: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-100 dark:border-amber-800",
      icon: AlertTriangle,
    },
    HUMAN: {
      label: "Human",
      cls: "bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950 dark:text-rose-100 dark:border-rose-800",
      icon: HandMetal,
    },
    UNCLEAR: {
      label: "Unclear",
      cls: "bg-slate-100 text-slate-900 border-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700",
      icon: HelpCircle,
    },
  };
  const c = cfg[verdict.verdict];
  const Icon = c.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs rounded-full border px-2 py-0.5 ${c.cls}`}
      title={`${verdict.confidence}% confidence — ${verdict.rationale}`}
    >
      <Icon className="h-3 w-3" />
      {c.label}
      <span className="opacity-60">{verdict.confidence}%</span>
    </span>
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
  connectionCompletionStatus,
  markComplete,
  onMarkCompleteChange,
  clickupUpdate,
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
  connectionCompletionStatus?: string | null;
  markComplete?: boolean;
  onMarkCompleteChange?: (v: boolean) => void;
  clickupUpdate?: { ok: boolean; status?: string; error?: string } | null;
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
                        {result?.autoFixes && result.autoFixes.length > 0 && (
                          <div className="mt-2 rounded-md bg-sky-50 dark:bg-sky-950 px-3 py-2 text-xs text-sky-900 dark:text-sky-100 space-y-0.5">
                            <div className="font-medium">
                              Server auto-fixes applied:
                            </div>
                            {result.autoFixes.map((note, j) => (
                              <div key={j}>• {note}</div>
                            ))}
                          </div>
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

            <div className="flex flex-col gap-2 pt-2 border-t">
              <div className="flex items-center gap-2 flex-wrap">
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
              {onMarkCompleteChange && (
                <label
                  className={`flex items-center gap-2 text-xs ${
                    connectionCompletionStatus
                      ? "text-foreground"
                      : "text-muted-foreground cursor-not-allowed"
                  }`}
                  title={
                    connectionCompletionStatus
                      ? `Sets ClickUp task status to "${connectionCompletionStatus}" if execute succeeds.`
                      : "Set a completion status on the connection (Edit) to enable this."
                  }
                >
                  <input
                    type="checkbox"
                    checked={!!markComplete}
                    disabled={!connectionCompletionStatus}
                    onChange={(e) => onMarkCompleteChange(e.target.checked)}
                    className="h-3.5 w-3.5"
                  />
                  Mark ClickUp task as &quot;
                  {connectionCompletionStatus || "(not configured)"}&quot;
                  on successful execute
                </label>
              )}
              {clickupUpdate && (
                <div
                  className={`text-xs rounded-md px-3 py-2 ${
                    clickupUpdate.ok
                      ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-100"
                      : "bg-amber-50 dark:bg-amber-950 text-amber-900 dark:text-amber-100"
                  }`}
                >
                  {clickupUpdate.ok ? (
                    <>
                      ✓ ClickUp task moved to{" "}
                      <span className="font-mono">{clickupUpdate.status}</span>
                    </>
                  ) : (
                    <>ClickUp update skipped: {clickupUpdate.error}</>
                  )}
                </div>
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

// ---------- History card --------------------------------------------------

function HistoryCard({
  history,
  loading,
  onRefresh,
  portals,
}: {
  history: ExecutionHistoryRow[];
  loading: boolean;
  onRefresh: () => void;
  portals: Portal[];
}) {
  const portalById = useMemo(
    () => new Map(portals.map((p) => [p.id, p])),
    [portals]
  );

  const summary = useMemo(() => {
    let success = 0;
    let partial = 0;
    let failed = 0;
    let other = 0;
    let live = 0;
    for (const r of history) {
      if (r.mode === "EXECUTE") live++;
      if (r.status === "SUCCESS") success++;
      else if (r.status === "PARTIAL") partial++;
      else if (r.status === "FAILED") failed++;
      else other++;
    }
    return { total: history.length, success, partial, failed, other, live };
  }, [history]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Recent runs</CardTitle>
          <CardDescription>
            {history.length === 0
              ? "No execution history yet for this connection."
              : `${summary.total} total · ${summary.live} live · ${summary.success} success · ${summary.partial} partial · ${summary.failed} failed`}
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={loading}
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Plan and execute a task to see it appear here.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Task</th>
                  <th className="px-3 py-2 font-medium">Mode</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Portal</th>
                  <th className="px-3 py-2 font-medium">Took</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => {
                  const portal = portalById.get(row.portalId);
                  const took =
                    row.completedAt && row.createdAt
                      ? `${Math.round(
                          (new Date(row.completedAt).getTime() -
                            new Date(row.createdAt).getTime()) /
                            1000
                        )}s`
                      : "—";
                  return (
                    <tr key={row.id} className="border-t align-top">
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(row.createdAt).toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium truncate max-w-[280px]">
                          {row.taskName}
                        </div>
                        {row.errorMessage && (
                          <div className="text-xs text-red-700 dark:text-red-400 truncate max-w-[280px]">
                            {row.errorMessage}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          variant={
                            row.mode === "EXECUTE"
                              ? "default"
                              : row.mode === "DRY_RUN"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {row.mode}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          <RunStatusDot status={row.status} />
                          {row.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {portal ? (
                          <>
                            {portal.name}{" "}
                            <span className="font-mono opacity-60">
                              ({portal.portalId})
                            </span>
                          </>
                        ) : (
                          row.hubspotPortalId || "—"
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                        {took}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
