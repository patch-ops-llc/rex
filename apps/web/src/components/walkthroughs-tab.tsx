"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import {
  Presentation,
  Plus,
  Loader2,
  ExternalLink,
  Copy,
  Check,
  Trash2,
  Eye,
} from "lucide-react";

interface WalkthroughSummary {
  id: string;
  title: string;
  description: string | null;
  status: string;
  shareToken: string;
  generatedAt: string | null;
  createdAt: string;
  _count: { steps: number };
}

interface WalkthroughsTabProps {
  engagementId: string;
  hasBuildPlan: boolean;
  initialWalkthroughs: WalkthroughSummary[];
}

export function WalkthroughsTab({
  engagementId,
  hasBuildPlan,
  initialWalkthroughs,
}: WalkthroughsTabProps) {
  const [walkthroughs, setWalkthroughs] = useState<WalkthroughSummary[]>(initialWalkthroughs);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const generateWalkthrough = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/walkthroughs`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to generate walkthrough");
      }
      const created = await res.json();
      setWalkthroughs((prev) => [created, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setGenerating(false);
    }
  }, [engagementId]);

  const deleteWalkthrough = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/walkthroughs/${id}`, { method: "DELETE" });
      if (res.ok) {
        setWalkthroughs((prev) => prev.filter((w) => w.id !== id));
      }
    } catch {
      // silently fail
    }
  }, []);

  const copyShareLink = useCallback(async (token: string, id: string) => {
    const url = `${window.location.origin}/walkthrough/${token}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle>Walkthroughs</CardTitle>
          <CardDescription>
            Interactive, shareable guides that walk clients through what was
            built in their HubSpot portal.
          </CardDescription>
        </div>
        <Button
          onClick={generateWalkthrough}
          disabled={generating || !hasBuildPlan}
          size="sm"
        >
          {generating ? (
            <>
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <Plus className="h-4 w-4 mr-1.5" />
              Generate Walkthrough
            </>
          )}
        </Button>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 mb-4">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {!hasBuildPlan && (
          <p className="text-sm text-muted-foreground py-8 text-center">
            A build plan is required before generating a walkthrough. Complete
            discovery and generate a build plan first.
          </p>
        )}

        {hasBuildPlan && walkthroughs.length === 0 && !generating && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Presentation className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm font-medium">No walkthroughs yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Click &quot;Generate Walkthrough&quot; to create an interactive
              client enablement guide from the build plan.
            </p>
          </div>
        )}

        {walkthroughs.length > 0 && (
          <div className="space-y-3">
            {walkthroughs.map((w) => (
              <div
                key={w.id}
                className="rounded-lg border p-4 flex items-start justify-between gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {w.title}
                    </span>
                    <StatusBadge status={w.status} />
                  </div>
                  {w.description && (
                    <p className="text-sm text-muted-foreground mt-0.5 truncate">
                      {w.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                    <span>{w._count.steps} steps</span>
                    {w.generatedAt && (
                      <span>
                        Generated{" "}
                        {new Date(w.generatedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {w.status === "READY" && (
                    <>
                      <Link
                        href={`/walkthrough/${w.shareToken}`}
                        target="_blank"
                        className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View
                      </Link>
                      <button
                        onClick={() => copyShareLink(w.shareToken, w.id)}
                        className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
                      >
                        {copiedId === w.id ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-green-600" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            Share
                          </>
                        )}
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => deleteWalkthrough(w.id)}
                    className="inline-flex items-center rounded-md border px-2 py-1.5 text-xs hover:bg-destructive/10 hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
