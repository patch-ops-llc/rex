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
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AddSOWDialog } from "@/components/add-sow-dialog";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  DollarSign,
  Plus,
  TrendingUp,
  XCircle,
} from "lucide-react";

interface LineItem {
  id: string;
  workstream: string;
  description: string | null;
  allocatedHours: number;
  consumedHours: number;
  rateTier: string;
  hourlyRate: number;
}

interface SOWData {
  id: string;
  title: string;
  version: number;
  status: string;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  lineItems: LineItem[];
  totals: {
    allocatedHours: number;
    consumedHours: number;
    allocatedBudget: number;
    consumedBudget: number;
  };
}

interface ScopeAlertData {
  id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  workstream: string | null;
  hoursImpact: number | null;
  budgetImpact: number | null;
  status: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  createdAt: string;
}

const RATE_TIER_LABELS: Record<string, string> = {
  TIER_1: "T1",
  TIER_2: "T2",
  TIER_3: "T3",
};

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "secondary",
  ACTIVE: "success",
  AMENDED: "warning",
  COMPLETE: "default",
  CANCELLED: "destructive",
};

const SEVERITY_CONFIG: Record<
  string,
  { color: string; icon: typeof AlertTriangle; bgClass: string }
> = {
  INFO: {
    color: "text-blue-600",
    icon: TrendingUp,
    bgClass: "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950",
  },
  WARNING: {
    color: "text-amber-600",
    icon: AlertTriangle,
    bgClass: "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950",
  },
  CRITICAL: {
    color: "text-red-600",
    icon: XCircle,
    bgClass: "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950",
  },
};

function UtilizationBar({
  consumed,
  allocated,
}: {
  consumed: number;
  allocated: number;
}) {
  const pct = allocated > 0 ? Math.min((consumed / allocated) * 100, 100) : 0;
  const overflow = consumed > allocated;
  const overflowPct = overflow
    ? Math.min(((consumed - allocated) / allocated) * 100, 50)
    : 0;

  let barColor = "bg-blue-600";
  if (pct >= 100) barColor = "bg-red-600";
  else if (pct >= 80) barColor = "bg-amber-500";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {consumed.toFixed(1)}h / {allocated}h
        </span>
        <span
          className={
            pct >= 100
              ? "text-red-600 font-semibold"
              : pct >= 80
              ? "text-amber-600 font-medium"
              : "text-muted-foreground"
          }
        >
          {pct.toFixed(0)}%
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden relative">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
        {overflow && (
          <div
            className="absolute top-0 right-0 h-full bg-red-400 opacity-60 animate-pulse rounded-r-full"
            style={{ width: `${overflowPct}%` }}
          />
        )}
      </div>
    </div>
  );
}

function LogHoursDialog({
  engagementId,
  lineItems,
}: {
  engagementId: string;
  lineItems: LineItem[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedLineItem, setSelectedLineItem] = useState("");
  const [hours, setHours] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(
        `/api/engagements/${engagementId}/sow/log-hours`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lineItemId: selectedLineItem,
            hours: parseFloat(hours),
          }),
        }
      );
      if (!res.ok) throw new Error("Failed to log hours");
      setOpen(false);
      setHours("");
      setSelectedLineItem("");
      router.refresh();
    } catch (error) {
      console.error("Failed to log hours:", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Clock className="mr-2 h-4 w-4" />
          Log Hours
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Log Hours</DialogTitle>
            <DialogDescription>
              Record hours consumed against a workstream. Alerts fire
              automatically at 80% and 100% utilization.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Workstream</Label>
              <Select
                value={selectedLineItem}
                onValueChange={setSelectedLineItem}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select workstream" />
                </SelectTrigger>
                <SelectContent>
                  {lineItems.map((li) => (
                    <SelectItem key={li.id} value={li.id}>
                      {li.workstream} ({li.consumedHours.toFixed(1)}h /{" "}
                      {li.allocatedHours}h)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Hours</Label>
              <Input
                type="number"
                step="0.25"
                min="0.25"
                placeholder="e.g. 2.5"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={loading || !selectedLineItem || !hours}
            >
              {loading ? "Logging..." : "Log Hours"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddScopeAlertDialog({ engagementId }: { engagementId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    type: "SCOPE_CREEP",
    severity: "WARNING",
    title: "",
    description: "",
    workstream: "",
    hoursImpact: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(
        `/api/engagements/${engagementId}/scope-alerts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: form.type,
            severity: form.severity,
            title: form.title,
            description: form.description,
            workstream: form.workstream || null,
            hoursImpact: form.hoursImpact
              ? parseFloat(form.hoursImpact)
              : null,
          }),
        }
      );
      if (!res.ok) throw new Error("Failed to create alert");
      setOpen(false);
      setForm({
        type: "SCOPE_CREEP",
        severity: "WARNING",
        title: "",
        description: "",
        workstream: "",
        hoursImpact: "",
      });
      router.refresh();
    } catch (error) {
      console.error("Failed to create alert:", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <AlertTriangle className="mr-2 h-4 w-4" />
          Flag Scope Issue
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Flag Scope Issue</DialogTitle>
            <DialogDescription>
              Manually flag scope creep, out-of-scope requests, or budget
              concerns.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Type</Label>
                <Select
                  value={form.type}
                  onValueChange={(val) =>
                    setForm((f) => ({ ...f, type: val }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SCOPE_CREEP">Scope Creep</SelectItem>
                    <SelectItem value="OUT_OF_SCOPE">Out of Scope</SelectItem>
                    <SelectItem value="OVER_BUDGET">Over Budget</SelectItem>
                    <SelectItem value="OVER_HOURS">Over Hours</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Severity</Label>
                <Select
                  value={form.severity}
                  onValueChange={(val) =>
                    setForm((f) => ({ ...f, severity: val }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INFO">Info</SelectItem>
                    <SelectItem value="WARNING">Warning</SelectItem>
                    <SelectItem value="CRITICAL">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Title</Label>
              <Input
                placeholder="e.g. Client requested custom API integration"
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
                required
              />
            </div>
            <div className="grid gap-2">
              <Label>Description</Label>
              <Textarea
                placeholder="What was requested, why it's outside scope, estimated impact..."
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                required
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Workstream (optional)</Label>
                <Input
                  placeholder="e.g. Systems Optimization"
                  value={form.workstream}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, workstream: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Hours Impact (optional)</Label>
                <Input
                  type="number"
                  step="0.5"
                  placeholder="e.g. 15"
                  value={form.hoursImpact}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, hoursImpact: e.target.value }))
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create Alert"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ScopeAlertCard({
  alert,
  engagementId,
}: {
  alert: ScopeAlertData;
  engagementId: string;
}) {
  const router = useRouter();
  const [resolving, setResolving] = useState(false);
  const [resolutionNote, setResolutionNote] = useState("");

  const config = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.INFO;
  const Icon = config.icon;
  const isOpen = alert.status === "OPEN" || alert.status === "ACKNOWLEDGED";

  async function resolve(status: "RESOLVED" | "DISMISSED") {
    setResolving(true);
    try {
      await fetch(`/api/engagements/${engagementId}/scope-alerts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alertId: alert.id,
          status,
          resolutionNote: resolutionNote || null,
        }),
      });
      router.refresh();
    } catch (error) {
      console.error("Failed to resolve alert:", error);
    } finally {
      setResolving(false);
    }
  }

  const typeLabels: Record<string, string> = {
    SCOPE_CREEP: "Scope Creep",
    OUT_OF_SCOPE: "Out of Scope",
    OVER_BUDGET: "Over Budget",
    OVER_HOURS: "Over Hours",
    APPROACHING_LIMIT: "Approaching Limit",
  };

  return (
    <div className={`rounded-lg border p-4 space-y-2 ${isOpen ? config.bgClass : "opacity-60"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${config.color}`} />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold">{alert.title}</span>
              <Badge variant="outline" className="text-xs">
                {typeLabels[alert.type] || alert.type}
              </Badge>
              {!isOpen && (
                <Badge variant="secondary" className="text-xs">
                  {alert.status === "RESOLVED" ? "Resolved" : "Dismissed"}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {alert.description}
            </p>
            {alert.workstream && (
              <p className="text-xs text-muted-foreground mt-1">
                Workstream: {alert.workstream}
              </p>
            )}
            {(alert.hoursImpact || alert.budgetImpact) && (
              <p className="text-xs font-medium mt-1">
                {alert.hoursImpact && `+${alert.hoursImpact.toFixed(1)}h`}
                {alert.hoursImpact && alert.budgetImpact && " · "}
                {alert.budgetImpact &&
                  `+$${alert.budgetImpact.toLocaleString()}`}
              </p>
            )}
            {alert.resolutionNote && (
              <p className="text-xs text-muted-foreground mt-2 italic">
                Resolution: {alert.resolutionNote}
              </p>
            )}
          </div>
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {new Date(alert.createdAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}
        </span>
      </div>

      {isOpen && (
        <div className="flex items-center gap-2 pt-1">
          <Input
            placeholder="Resolution note (optional)"
            className="text-xs h-8"
            value={resolutionNote}
            onChange={(e) => setResolutionNote(e.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs shrink-0"
            onClick={() => resolve("RESOLVED")}
            disabled={resolving}
          >
            <CheckCircle className="mr-1 h-3 w-3" />
            Resolve
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs shrink-0"
            onClick={() => resolve("DISMISSED")}
            disabled={resolving}
          >
            Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}

export function ScopeTab({
  engagementId,
  sow,
  scopeAlerts,
}: {
  engagementId: string;
  sow: SOWData | null;
  scopeAlerts: ScopeAlertData[];
}) {
  const openAlerts = scopeAlerts.filter(
    (a) => a.status === "OPEN" || a.status === "ACKNOWLEDGED"
  );
  const resolvedAlerts = scopeAlerts.filter(
    (a) => a.status === "RESOLVED" || a.status === "DISMISSED"
  );

  if (!sow) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>Scope Tracking</CardTitle>
            <CardDescription>
              Attach a Statement of Work to track scope, hours, and budget
              against this engagement.
            </CardDescription>
          </div>
          <AddSOWDialog engagementId={engagementId} />
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground py-8 text-center">
            No SOW attached yet. Add one to enable scope tracking and automatic
            scope creep alerts.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { totals } = sow;
  const overallUtilization =
    totals.allocatedHours > 0
      ? (totals.consumedHours / totals.allocatedHours) * 100
      : 0;

  return (
    <div className="space-y-4">
      {/* SOW Header */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between pb-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              {sow.title}
              <Badge
                variant={
                  (STATUS_STYLES[sow.status] as any) || "outline"
                }
              >
                {sow.status}
              </Badge>
              <span className="text-xs font-normal text-muted-foreground">
                v{sow.version}
              </span>
            </CardTitle>
            <CardDescription>
              {sow.startDate &&
                new Date(sow.startDate).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              {sow.startDate && sow.endDate && " — "}
              {sow.endDate &&
                new Date(sow.endDate).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <LogHoursDialog
              engagementId={engagementId}
              lineItems={sow.lineItems}
            />
            <AddScopeAlertDialog engagementId={engagementId} />
          </div>
        </CardHeader>
        <CardContent>
          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                Hours Used
              </div>
              <p className="text-lg font-semibold">
                {totals.consumedHours.toFixed(1)}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  / {totals.allocatedHours}h
                </span>
              </p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <DollarSign className="h-3 w-3" />
                Budget Used
              </div>
              <p className="text-lg font-semibold">
                ${totals.consumedBudget.toLocaleString()}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  / ${totals.allocatedBudget.toLocaleString()}
                </span>
              </p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <TrendingUp className="h-3 w-3" />
                Utilization
              </div>
              <p
                className={`text-lg font-semibold ${
                  overallUtilization >= 100
                    ? "text-red-600"
                    : overallUtilization >= 80
                    ? "text-amber-600"
                    : ""
                }`}
              >
                {overallUtilization.toFixed(0)}%
              </p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <AlertTriangle className="h-3 w-3" />
                Open Alerts
              </div>
              <p
                className={`text-lg font-semibold ${
                  openAlerts.length > 0 ? "text-amber-600" : ""
                }`}
              >
                {openAlerts.length}
              </p>
            </div>
          </div>

          {/* Overall utilization bar */}
          <UtilizationBar
            consumed={totals.consumedHours}
            allocated={totals.allocatedHours}
          />
        </CardContent>
      </Card>

      {/* Workstream breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workstream Burn</CardTitle>
          <CardDescription>
            Hours consumed vs. allocated per workstream.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {sow.lineItems.map((li) => {
              const remaining = li.allocatedHours - li.consumedHours;
              const lineTotal = li.allocatedHours * li.hourlyRate;
              const lineConsumed = li.consumedHours * li.hourlyRate;

              return (
                <div key={li.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium">
                        {li.workstream}
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {RATE_TIER_LABELS[li.rateTier] || li.rateTier} · $
                        {li.hourlyRate}/hr
                      </span>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <span
                        className={
                          remaining < 0
                            ? "text-red-600 font-medium"
                            : ""
                        }
                      >
                        {remaining > 0 ? `${remaining.toFixed(1)}h remaining` : `${Math.abs(remaining).toFixed(1)}h over`}
                      </span>
                      <span className="ml-2">
                        ${lineConsumed.toLocaleString()} / $
                        {lineTotal.toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <UtilizationBar
                    consumed={li.consumedHours}
                    allocated={li.allocatedHours}
                  />
                  {li.description && (
                    <p className="text-xs text-muted-foreground">
                      {li.description}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Scope Alerts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            Scope Alerts
            {openAlerts.length > 0 && (
              <Badge variant="destructive" className="text-xs">
                {openAlerts.length} open
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Scope creep, out-of-scope requests, and budget warnings. Alerts at
            80% and 100% utilization are generated automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {scopeAlerts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No scope alerts yet. They will appear automatically as hours are
              consumed, or you can flag issues manually.
            </p>
          ) : (
            <div className="space-y-3">
              {openAlerts.length > 0 && (
                <div className="space-y-2">
                  {openAlerts.map((alert) => (
                    <ScopeAlertCard
                      key={alert.id}
                      alert={alert}
                      engagementId={engagementId}
                    />
                  ))}
                </div>
              )}
              {resolvedAlerts.length > 0 && (
                <details className="mt-4">
                  <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                    {resolvedAlerts.length} resolved/dismissed alert
                    {resolvedAlerts.length !== 1 ? "s" : ""}
                  </summary>
                  <div className="space-y-2 mt-2">
                    {resolvedAlerts.map((alert) => (
                      <ScopeAlertCard
                        key={alert.id}
                        alert={alert}
                        engagementId={engagementId}
                      />
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* SOW notes */}
      {sow.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">SOW Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{sow.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
