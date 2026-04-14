"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  FileText,
  Upload,
  ThumbsUp,
  ThumbsDown,
  Play,
  X,
} from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface BuildPlanTabProps {
  engagementId: string;
  buildPlan: {
    id: string;
    version: number;
    status: string;
    planData: any;
    createdAt: string;
    updatedAt: string;
  } | null;
  completedCallCount: number;
  totalInsightCount: number;
  requirementCount: number;
  hasActivePortal: boolean;
}

function PlanSummary({ planData }: { planData: any }) {
  const sections = [
    { label: "Property Groups", count: planData?.propertyGroups?.length || 0, icon: "📁" },
    { label: "Properties", count: planData?.properties?.length || 0, icon: "🏷️" },
    { label: "Custom Objects", count: planData?.customObjects?.length || 0, icon: "🔷" },
    { label: "Associations", count: planData?.associations?.length || 0, icon: "🔗" },
    { label: "Pipelines", count: planData?.pipelines?.length || 0, icon: "📊" },
    { label: "Workflows", count: planData?.workflows?.length || 0, icon: "⚡" },
    { label: "Lists", count: planData?.lists?.length || 0, icon: "📋" },
    { label: "Views", count: planData?.views?.length || 0, icon: "👁️" },
  ].filter((s) => s.count > 0);

  const humanItems = planData?.humanRequiredItems || [];
  const qaItems = planData?.qaChecklist || [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {sections.map((s) => (
          <div key={s.label} className="rounded-lg border bg-card p-3 text-center">
            <div className="text-2xl font-bold">{s.count}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      {humanItems.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            Human-Required Items ({humanItems.length})
          </h4>
          <div className="space-y-1">
            {humanItems.map((item: any, i: number) => (
              <div key={i} className="flex items-start gap-2 rounded border p-2 text-sm">
                <span
                  className={`mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full ${
                    item.priority === "HIGH"
                      ? "bg-red-500"
                      : item.priority === "MEDIUM"
                        ? "bg-amber-500"
                        : "bg-slate-400"
                  }`}
                />
                <div>
                  <span className="font-medium">{item.description}</span>
                  <span className="text-xs text-muted-foreground ml-2">({item.category})</span>
                  {item.reason && (
                    <p className="text-xs text-muted-foreground mt-0.5">{item.reason}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {qaItems.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            QA Checklist ({qaItems.length})
          </h4>
          <div className="space-y-1">
            {qaItems.map((item: any, i: number) => (
              <div key={i} className="flex items-start gap-2 rounded border p-2 text-sm">
                <span className="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-slate-300" />
                <div>
                  <span>{item.description}</span>
                  <span className="text-xs text-muted-foreground ml-2">({item.category})</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <details className="group">
        <summary className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <FileText className="h-3 w-3" />
          View raw plan JSON
        </summary>
        <pre className="mt-2 rounded-lg bg-muted p-4 text-xs overflow-auto max-h-96">
          {JSON.stringify(planData, null, 2)}
        </pre>
      </details>
    </div>
  );
}

export function BuildPlanTab({
  engagementId,
  buildPlan,
  completedCallCount,
  totalInsightCount,
  requirementCount,
  hasActivePortal,
}: BuildPlanTabProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [implementing, setImplementing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);
  const [confirmImplement, setConfirmImplement] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const busy = generating || uploading || approving || implementing;

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/build-plan/generate`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Generation failed");
      }
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
      setConfirmRegenerate(false);
    }
  }

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    setSuccess(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/engagements/${engagementId}/build-plan/upload`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        const msg = data.validationErrors?.length
          ? data.validationErrors.join(". ")
          : data.error;
        throw new Error(msg || "Upload failed");
      }
      setSuccess("Build plan uploaded successfully");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleApprove() {
    setApproving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/build-plan/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Approval failed");
      }
      setSuccess("Build plan approved! Tasks have been generated in the pipeline.");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setApproving(false);
      setConfirmApprove(false);
    }
  }

  async function handleReject() {
    setApproving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/build-plan/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", reason: rejectReason }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Rejection failed");
      }
      setSuccess("Build plan rejected. Regenerate or upload a new version.");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setApproving(false);
      setConfirmReject(false);
      setRejectReason("");
    }
  }

  async function handleImplement() {
    setImplementing(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/implement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok && res.status !== 207) {
        throw new Error(data.error || "Implementation failed");
      }
      if (data.failedSteps > 0) {
        setSuccess(
          `Implementation complete with issues: ${data.completedSteps}/${data.totalSteps} succeeded, ${data.failedSteps} failed. Check the Implementation tab.`,
        );
      } else {
        setSuccess(
          `Implementation complete! ${data.completedSteps} steps executed successfully. ${data.humanRequiredItems?.length || 0} items need manual follow-up.`,
        );
      }
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setImplementing(false);
      setConfirmImplement(false);
    }
  }

  const hasDiscovery = completedCallCount > 0;
  const canApprove = buildPlan && ["DRAFT", "PENDING_REVIEW", "REJECTED"].includes(buildPlan.status);
  const canImplement = buildPlan?.status === "APPROVED" && hasActivePortal;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>Build Plan</CardTitle>
            <CardDescription>
              HubSpot implementation plan — generated by Rex or uploaded manually.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
            >
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              Upload JSON
            </Button>

            {buildPlan && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmRegenerate(true)}
                disabled={busy || !hasDiscovery}
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Regenerate
              </Button>
            )}
            {!buildPlan && (
              <Button size="sm" onClick={handleGenerate} disabled={busy || !hasDiscovery}>
                {generating ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                    Generate Build Plan
                  </>
                )}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
              <X className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="mb-4 rounded-lg border border-emerald-500/50 bg-emerald-50 dark:bg-emerald-950/20 p-3 text-sm text-emerald-700 dark:text-emerald-300 flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          )}

          {(generating || uploading) && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <div className="text-center">
                <p className="text-sm font-medium">
                  {generating ? "Generating build plan..." : "Uploading build plan..."}
                </p>
                {generating && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Analyzing {completedCallCount} discovery call{completedCallCount !== 1 ? "s" : ""},
                    {" "}{totalInsightCount} insight{totalInsightCount !== 1 ? "s" : ""},
                    and {requirementCount} requirement{requirementCount !== 1 ? "s" : ""}
                  </p>
                )}
              </div>
            </div>
          )}

          {implementing && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <div className="text-center">
                <p className="text-sm font-medium">Executing build plan against HubSpot...</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Creating properties, pipelines, and objects via API. This may take a few minutes.
                </p>
              </div>
            </div>
          )}

          {!busy && buildPlan && (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border bg-muted/50 p-3">
                <div className="flex items-center gap-3">
                  <StatusBadge status={buildPlan.status} />
                  <span className="text-sm text-muted-foreground">Version {buildPlan.version}</span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(buildPlan.updatedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {canApprove && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirmReject(true)}
                        disabled={busy}
                      >
                        <ThumbsDown className="h-3.5 w-3.5 mr-1.5" />
                        Reject
                      </Button>
                      <Button size="sm" onClick={() => setConfirmApprove(true)} disabled={busy}>
                        <ThumbsUp className="h-3.5 w-3.5 mr-1.5" />
                        Approve
                      </Button>
                    </>
                  )}

                  {canImplement && (
                    <Button size="sm" onClick={() => setConfirmImplement(true)} disabled={busy}>
                      <Play className="h-3.5 w-3.5 mr-1.5" />
                      Execute Build
                    </Button>
                  )}

                  {buildPlan.status === "APPROVED" && !hasActivePortal && (
                    <span className="text-xs text-amber-600">
                      Connect a HubSpot portal to execute
                    </span>
                  )}
                </div>
              </div>
              <PlanSummary planData={buildPlan.planData} />
            </div>
          )}

          {!busy && !buildPlan && (
            <div className="py-12 text-center space-y-3">
              {hasDiscovery ? (
                <>
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                    <Sparkles className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Ready to generate</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {completedCallCount} completed call{completedCallCount !== 1 ? "s" : ""} with
                      {" "}{totalInsightCount} insight{totalInsightCount !== 1 ? "s" : ""} and
                      {" "}{requirementCount} requirement{requirementCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <Upload className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">No build plan yet</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Upload a JSON build plan or complete a discovery session to generate one.
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Regenerate confirm */}
      <AlertDialog open={confirmRegenerate} onOpenChange={setConfirmRegenerate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate build plan?</AlertDialogTitle>
            <AlertDialogDescription>
              This will create a new version from the latest discovery data. The current plan
              (v{buildPlan?.version}) will be replaced. Any manual edits will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={generating}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleGenerate} disabled={generating}>
              {generating ? "Generating..." : "Regenerate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Approve confirm */}
      <AlertDialog open={confirmApprove} onOpenChange={setConfirmApprove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve build plan?</AlertDialogTitle>
            <AlertDialogDescription>
              Approving will lock this version and generate implementation tasks in the pipeline.
              You can then execute the build against the connected HubSpot portal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={approving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleApprove} disabled={approving}>
              {approving ? "Approving..." : "Approve Plan"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject confirm */}
      <AlertDialog open={confirmReject} onOpenChange={setConfirmReject}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject build plan?</AlertDialogTitle>
            <AlertDialogDescription>
              The plan will be marked as rejected. You can regenerate or upload a revised version.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6">
            <textarea
              className="w-full rounded-md border p-2 text-sm"
              placeholder="Reason for rejection (optional)"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={approving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReject}
              disabled={approving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {approving ? "Rejecting..." : "Reject Plan"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Implement confirm */}
      <AlertDialog open={confirmImplement} onOpenChange={setConfirmImplement}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Execute build plan?</AlertDialogTitle>
            <AlertDialogDescription>
              This will create properties, pipelines, objects, and other HubSpot assets via API on
              the connected portal. This action makes live changes to the HubSpot account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={implementing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleImplement} disabled={implementing}>
              {implementing ? "Executing..." : "Execute Build"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
