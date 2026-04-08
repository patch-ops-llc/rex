"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Check,
  ChevronRight,
  Circle,
  Clock,
  Loader2,
  Lock,
  Pause,
  Play,
  Plus,
  SkipForward,
  UserCheck,
  XCircle,
} from "lucide-react";
import type { PHASE_DEFINITIONS } from "@rex/shared";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TaskData {
  id: string;
  phaseType: string;
  title: string;
  description: string | null;
  status: string;
  taskType: string;
  assignedTo: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

interface PhaseData {
  id: string;
  phaseType: string;
  status: string;
  displayOrder: number;
  startedAt: string | null;
  completedAt: string | null;
  blockedReason: string | null;
  tasks: TaskData[];
}

interface PipelineProgress {
  completedPhases: number;
  totalPhases: number;
  completedTasks: number;
  totalTasks: number;
  blockedTasks: number;
  percentComplete: number;
}

interface PipelineViewProps {
  engagementId: string;
  phases: PhaseData[];
  progress: PipelineProgress;
  activePhase: PhaseData | null;
  hasSow: boolean;
  hasPortal?: boolean;
}

// ─── Phase config ───────────────────────────────────────────────────────────

const PHASE_META: Record<
  string,
  { label: string; shortLabel: string; icon: string }
> = {
  SOW_SETUP: { label: "SOW Setup", shortLabel: "SOW", icon: "📋" },
  DISCOVERY_PREP: { label: "Discovery Prep", shortLabel: "Prep", icon: "🔍" },
  DISCOVERY: { label: "Discovery", shortLabel: "Disc", icon: "🎙️" },
  REQUIREMENTS: { label: "Requirements", shortLabel: "Reqs", icon: "📝" },
  BUILD_PLANNING: { label: "Build Planning", shortLabel: "Plan", icon: "🏗️" },
  BUILD_APPROVAL: { label: "Build Approval", shortLabel: "Approve", icon: "✅" },
  IMPLEMENTATION: { label: "Implementation", shortLabel: "Build", icon: "⚡" },
  HUMAN_CLEANUP: { label: "Human Cleanup", shortLabel: "Cleanup", icon: "🧹" },
  UAT: { label: "UAT", shortLabel: "UAT", icon: "🧪" },
  CLOSEOUT: { label: "Closeout", shortLabel: "Close", icon: "🏁" },
};

const PHASE_STATUS_BADGE: Record<string, { variant: any; label: string }> = {
  NOT_STARTED: { variant: "secondary", label: "Not Started" },
  IN_PROGRESS: { variant: "info", label: "In Progress" },
  WAITING_ON_CLIENT: { variant: "warning", label: "Waiting on Client" },
  WAITING_ON_APPROVAL: { variant: "warning", label: "Awaiting Approval" },
  BLOCKED: { variant: "destructive", label: "Blocked" },
  COMPLETED: { variant: "success", label: "Complete" },
  SKIPPED: { variant: "secondary", label: "Skipped" },
};

const TASK_STATUS_ICON: Record<string, typeof Circle> = {
  PENDING: Circle,
  IN_PROGRESS: Loader2,
  WAITING_ON_CLIENT: Pause,
  WAITING_ON_APPROVAL: UserCheck,
  COMPLETED: Check,
  FAILED: XCircle,
  SKIPPED: SkipForward,
};

const TASK_TYPE_LABELS: Record<string, string> = {
  AUTO: "Automated",
  HUMAN: "Manual",
  CLIENT_ACTION: "Client",
  APPROVAL: "Approval",
  REVIEW: "Review",
};

// ─── Phase Rail ─────────────────────────────────────────────────────────────

function PhaseRail({
  phases,
  selectedPhase,
  onSelect,
}: {
  phases: PhaseData[];
  selectedPhase: string | null;
  onSelect: (phaseType: string) => void;
}) {
  return (
    <div className="flex items-center gap-0 overflow-x-auto pb-2">
      {phases.map((phase, idx) => {
        const meta = PHASE_META[phase.phaseType] || {
          label: phase.phaseType,
          shortLabel: phase.phaseType,
          icon: "📦",
        };
        const statusBadge = PHASE_STATUS_BADGE[phase.status] || PHASE_STATUS_BADGE.NOT_STARTED;
        const isSelected = selectedPhase === phase.phaseType;
        const isActive = ["IN_PROGRESS", "WAITING_ON_CLIENT", "WAITING_ON_APPROVAL"].includes(phase.status);
        const isComplete = phase.status === "COMPLETED";
        const isBlocked = phase.status === "BLOCKED";

        return (
          <div key={phase.id} className="flex items-center">
            <button
              onClick={() => onSelect(phase.phaseType)}
              className={`
                relative flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-all min-w-[72px]
                ${isSelected ? "bg-primary/10 ring-2 ring-primary" : "hover:bg-muted"}
                ${isBlocked ? "opacity-75" : ""}
              `}
            >
              <div
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center text-sm
                  ${isComplete ? "bg-green-100 dark:bg-green-900" : ""}
                  ${isActive ? "bg-blue-100 dark:bg-blue-900 ring-2 ring-blue-400 animate-pulse" : ""}
                  ${isBlocked ? "bg-red-100 dark:bg-red-900" : ""}
                  ${phase.status === "NOT_STARTED" ? "bg-muted" : ""}
                  ${phase.status === "SKIPPED" ? "bg-muted opacity-50" : ""}
                `}
              >
                {meta.icon}
              </div>
              <span className="text-[10px] font-medium leading-tight text-center">
                {meta.shortLabel}
              </span>
              {isActive && (
                <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
              )}
              {isBlocked && (
                <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500" />
              )}
            </button>
            {idx < phases.length - 1 && (
              <ChevronRight
                className={`h-4 w-4 shrink-0 ${
                  isComplete ? "text-green-500" : "text-muted-foreground/30"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Task Row ───────────────────────────────────────────────────────────────

function TaskRow({
  task,
  engagementId,
}: {
  task: TaskData;
  engagementId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const StatusIcon = TASK_STATUS_ICON[task.status] || Circle;
  const isActionable =
    task.status === "PENDING" || task.status === "IN_PROGRESS";

  async function performAction(action: string) {
    setLoading(true);
    try {
      await fetch(`/api/engagements/${engagementId}/pipeline/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, taskId: task.id }),
      });
      router.refresh();
    } catch (error) {
      console.error("Task action failed:", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 py-2 px-3 rounded-md hover:bg-muted/50 group">
      <div className="flex items-center gap-3 min-w-0">
        <StatusIcon
          className={`h-4 w-4 shrink-0 ${
            task.status === "COMPLETED"
              ? "text-green-600"
              : task.status === "FAILED"
              ? "text-red-600"
              : task.status === "IN_PROGRESS"
              ? "text-blue-600 animate-spin"
              : "text-muted-foreground"
          }`}
        />
        <div className="min-w-0">
          <p
            className={`text-sm font-medium truncate ${
              task.status === "COMPLETED"
                ? "line-through text-muted-foreground"
                : task.status === "SKIPPED"
                ? "text-muted-foreground"
                : ""
            }`}
          >
            {task.title}
          </p>
          {task.errorMessage && (
            <p className="text-xs text-red-600 truncate">{task.errorMessage}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Badge variant="outline" className="text-[10px] h-5">
          {TASK_TYPE_LABELS[task.taskType] || task.taskType}
        </Badge>
        {isActionable && !loading && (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {task.status === "PENDING" && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0"
                onClick={() => performAction("start")}
                title="Start"
              >
                <Play className="h-3 w-3" />
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              onClick={() => performAction("complete")}
              title="Complete"
            >
              <Check className="h-3 w-3" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              onClick={() => performAction("skip")}
              title="Skip"
            >
              <SkipForward className="h-3 w-3" />
            </Button>
          </div>
        )}
        {loading && <Loader2 className="h-3 w-3 animate-spin" />}
      </div>
    </div>
  );
}

// ─── Add Task Dialog ────────────────────────────────────────────────────────

function AddTaskDialog({
  engagementId,
  phaseType,
}: {
  engagementId: string;
  phaseType: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [taskType, setTaskType] = useState("HUMAN");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch(`/api/engagements/${engagementId}/pipeline/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          phaseType,
          title,
          description,
          taskType,
        }),
      });
      setOpen(false);
      setTitle("");
      setDescription("");
      router.refresh();
    } catch (error) {
      console.error("Failed to add task:", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 text-xs">
          <Plus className="mr-1 h-3 w-3" />
          Add Task
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Task</DialogTitle>
            <DialogDescription>
              Add a task to the{" "}
              {PHASE_META[phaseType]?.label || phaseType} phase.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Task title"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label>Description</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
              />
            </div>
            <div className="grid gap-2">
              <Label>Type</Label>
              <Select value={taskType} onValueChange={setTaskType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AUTO">Automated</SelectItem>
                  <SelectItem value="HUMAN">Manual</SelectItem>
                  <SelectItem value="CLIENT_ACTION">Client Action</SelectItem>
                  <SelectItem value="APPROVAL">Approval</SelectItem>
                  <SelectItem value="REVIEW">Review</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading || !title}>
              {loading ? "Adding..." : "Add Task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Phase Detail Panel ─────────────────────────────────────────────────────

function PhaseDetail({
  phase,
  engagementId,
  hasPortal,
}: {
  phase: PhaseData;
  engagementId: string;
  hasPortal?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const meta = PHASE_META[phase.phaseType] || {
    label: phase.phaseType,
    icon: "📦",
  };
  const statusBadge = PHASE_STATUS_BADGE[phase.status] || PHASE_STATUS_BADGE.NOT_STARTED;

  const completedTasks = phase.tasks.filter(
    (t) => t.status === "COMPLETED" || t.status === "SKIPPED"
  ).length;

  async function phaseAction(action: string, reason?: string) {
    setLoading(true);
    try {
      await fetch(`/api/engagements/${engagementId}/pipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          phaseType: phase.phaseType,
          reason,
        }),
      });
      router.refresh();
    } catch (error) {
      console.error("Phase action failed:", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="text-lg">{meta.icon}</span>
              {meta.label}
              <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
            </CardTitle>
            {phase.blockedReason && (
              <CardDescription className="text-red-600 mt-1">
                Blocked: {phase.blockedReason}
              </CardDescription>
            )}
            {phase.startedAt && (
              <CardDescription className="mt-1">
                Started{" "}
                {new Date(phase.startedAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
                {phase.completedAt &&
                  ` — Completed ${new Date(phase.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
              </CardDescription>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!hasPortal &&
              phase.status === "NOT_STARTED" &&
              (phase.phaseType === "IMPLEMENTATION" || phase.phaseType === "HUMAN_CLEANUP") && (
                <span className="text-xs text-amber-600 mr-2 flex items-center gap-1">
                  <Lock className="h-3 w-3" />
                  Connect a HubSpot portal first
                </span>
              )}
            {phase.status === "NOT_STARTED" && (
              <Button
                size="sm"
                onClick={() => phaseAction("start_phase")}
                disabled={
                  loading ||
                  (!hasPortal &&
                    (phase.phaseType === "IMPLEMENTATION" || phase.phaseType === "HUMAN_CLEANUP"))
                }
              >
                <Play className="mr-1 h-3 w-3" />
                Start
              </Button>
            )}
            {phase.status === "IN_PROGRESS" && (
              <Button
                size="sm"
                onClick={() => phaseAction("complete_phase")}
                disabled={loading}
              >
                <Check className="mr-1 h-3 w-3" />
                Complete
              </Button>
            )}
            {phase.status === "BLOCKED" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => phaseAction("start_phase")}
                disabled={loading}
              >
                Unblock & Resume
              </Button>
            )}
            {(phase.status === "NOT_STARTED" || phase.status === "BLOCKED") && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => phaseAction("skip_phase", "Skipped by user")}
                disabled={loading}
              >
                <SkipForward className="mr-1 h-3 w-3" />
                Skip
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {phase.tasks.length === 0 ? (
          <div className="flex items-center justify-between py-4">
            <p className="text-sm text-muted-foreground">
              No tasks yet for this phase.
            </p>
            <AddTaskDialog
              engagementId={engagementId}
              phaseType={phase.phaseType}
            />
          </div>
        ) : (
          <div className="space-y-0.5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">
                {completedTasks}/{phase.tasks.length} tasks complete
              </span>
              <AddTaskDialog
                engagementId={engagementId}
                phaseType={phase.phaseType}
              />
            </div>
            {/* Task progress bar */}
            <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-3">
              <div
                className="h-full rounded-full bg-green-600 transition-all"
                style={{
                  width: `${
                    phase.tasks.length > 0
                      ? (completedTasks / phase.tasks.length) * 100
                      : 0
                  }%`,
                }}
              />
            </div>
            {phase.tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                engagementId={engagementId}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Pipeline View ─────────────────────────────────────────────────────

export function PipelineView({
  engagementId,
  phases,
  progress,
  activePhase,
  hasSow,
  hasPortal,
}: PipelineViewProps) {
  const router = useRouter();
  const [selectedPhase, setSelectedPhase] = useState<string | null>(
    activePhase?.phaseType || phases[0]?.phaseType || null
  );
  const [initializing, setInitializing] = useState(false);

  const selectedPhaseData = phases.find((p) => p.phaseType === selectedPhase);

  const [error, setError] = useState<string | null>(null);

  async function initPipeline() {
    setInitializing(true);
    setError(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/pipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "initialize" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to initialize pipeline";
      console.error("Failed to initialize pipeline:", err);
      setError(message);
    } finally {
      setInitializing(false);
    }
  }

  // No pipeline yet
  if (phases.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Delivery Pipeline</CardTitle>
          <CardDescription>
            Set up all 10 delivery phases (SOW Setup through Closeout) for this
            engagement. Each phase is modular — start, skip, or complete them
            independently. Tasks are generated when you start each phase.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4 py-8">
          {!hasSow && (
            <p className="text-sm text-amber-600">
              Tip: Add a SOW first to get the most from the pipeline. Discovery
              agendas and scope tracking are generated from SOW workstreams.
            </p>
          )}
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          <Button onClick={initPipeline} disabled={initializing}>
            {initializing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Initializing...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Initialize Pipeline
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Progress overview */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-4">
              <div>
                <span className="text-2xl font-bold">
                  {progress.percentComplete}%
                </span>
                <span className="text-sm text-muted-foreground ml-1">
                  complete
                </span>
              </div>
              <div className="h-8 w-px bg-border" />
              <div className="flex gap-4 text-sm">
                <span>
                  <strong>{progress.completedPhases}</strong>
                  <span className="text-muted-foreground">
                    /{progress.totalPhases} phases
                  </span>
                </span>
                <span>
                  <strong>{progress.completedTasks}</strong>
                  <span className="text-muted-foreground">
                    /{progress.totalTasks} tasks
                  </span>
                </span>
                {progress.blockedTasks > 0 && (
                  <span className="text-red-600">
                    <strong>{progress.blockedTasks}</strong> blocked
                  </span>
                )}
              </div>
            </div>
            {activePhase && (
              <Badge variant="info" className="text-xs">
                Active: {PHASE_META[activePhase.phaseType]?.label || activePhase.phaseType}
              </Badge>
            )}
          </div>
          {/* Overall progress bar */}
          <div className="h-2 rounded-full bg-muted overflow-hidden mb-3">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress.percentComplete}%` }}
            />
          </div>
          <PhaseRail
            phases={phases}
            selectedPhase={selectedPhase}
            onSelect={setSelectedPhase}
          />
        </CardContent>
      </Card>

      {/* Selected phase detail */}
      {selectedPhaseData && (
        <PhaseDetail
          phase={selectedPhaseData}
          engagementId={engagementId}
          hasPortal={hasPortal}
        />
      )}
    </div>
  );
}
