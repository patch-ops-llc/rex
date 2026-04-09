"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, RefreshCw, CheckCircle2, AlertTriangle, Clock, FileText } from "lucide-react";
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
          <div
            key={s.label}
            className="rounded-lg border bg-card p-3 text-center"
          >
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
                <span className={`mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full ${
                  item.priority === "HIGH" ? "bg-red-500" : item.priority === "MEDIUM" ? "bg-amber-500" : "bg-slate-400"
                }`} />
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
}: BuildPlanTabProps) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/engagements/${engagementId}/build-plan/generate`,
        { method: "POST" }
      );
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

  const hasDiscovery = completedCallCount > 0;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>Build Plan</CardTitle>
            <CardDescription>
              AI-generated HubSpot implementation plan from discovery output.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {buildPlan && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmRegenerate(true)}
                disabled={generating || !hasDiscovery}
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Regenerate
              </Button>
            )}
            {!buildPlan && (
              <Button
                size="sm"
                onClick={handleGenerate}
                disabled={generating || !hasDiscovery}
              >
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
            <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {generating && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <div className="text-center">
                <p className="text-sm font-medium">Generating build plan...</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Analyzing {completedCallCount} discovery call{completedCallCount !== 1 ? "s" : ""},
                  {" "}{totalInsightCount} insight{totalInsightCount !== 1 ? "s" : ""},
                  and {requirementCount} requirement{requirementCount !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
          )}

          {!generating && buildPlan && (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border bg-muted/50 p-3">
                <div className="flex items-center gap-3">
                  <StatusBadge status={buildPlan.status} />
                  <span className="text-sm text-muted-foreground">
                    Version {buildPlan.version}
                  </span>
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
              </div>
              <PlanSummary planData={buildPlan.planData} />
            </div>
          )}

          {!generating && !buildPlan && (
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
                  <p className="text-sm text-muted-foreground">
                    No build plan generated yet.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Complete at least one discovery session to generate a build plan.
                  </p>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmRegenerate} onOpenChange={setConfirmRegenerate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate build plan?</AlertDialogTitle>
            <AlertDialogDescription>
              This will create a new version of the build plan from the latest
              discovery data. The current plan (v{buildPlan?.version}) will be
              replaced. Any manual edits will be lost.
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
    </>
  );
}
