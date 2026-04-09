"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2, CheckCircle2, Sparkles } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { SendBotDialog } from "@/components/discovery/send-bot-dialog";
import { AddDiscoveryDialog } from "@/components/add-discovery-dialog";
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

interface DiscoveryCall {
  id: string;
  title: string | null;
  summary: string | null;
  meetingUrl: string | null;
  recallBotId: string | null;
  platform: string | null;
  status: string;
  structuredData: any;
  createdAt: string;
  _count: { segments: number; insights: number };
}

interface DiscoveryTabProps {
  engagementId: string;
  clientName: string;
  initialCalls: DiscoveryCall[];
  hasBuildPlan: boolean;
}

export function DiscoveryTab({
  engagementId,
  clientName,
  initialCalls,
  hasBuildPlan,
}: DiscoveryTabProps) {
  const router = useRouter();
  const [calls, setCalls] = useState(initialCalls);
  const [deleteTarget, setDeleteTarget] = useState<DiscoveryCall | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/engagements/${engagementId}/discovery/${deleteTarget.id}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setCalls((prev) => prev.filter((c) => c.id !== deleteTarget.id));
        router.refresh();
      }
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>Discovery</CardTitle>
            <CardDescription>
              Discovery calls and captured requirements for this engagement.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <SendBotDialog
              engagementId={engagementId}
              clientName={clientName}
            />
            <AddDiscoveryDialog engagementId={engagementId} />
          </div>
        </CardHeader>
        <CardContent>
          {(() => {
            const completedCalls = calls.filter((c) => c.status === "COMPLETED");
            const activeCalls = calls.filter((c) => c.status === "IN_PROGRESS" || c.status === "WAITING");
            const allDone = calls.length > 0 && activeCalls.length === 0 && completedCalls.length > 0;
            const totalInsights = completedCalls.reduce((sum, c) => sum + c._count.insights, 0);

            if (allDone && !hasBuildPlan) {
              return (
                <div className="mb-4 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/30">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <div>
                      <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
                        Discovery complete
                      </p>
                      <p className="text-xs text-emerald-700 dark:text-emerald-300">
                        {completedCalls.length} call{completedCalls.length !== 1 ? "s" : ""} with {totalInsights} insight{totalInsights !== 1 ? "s" : ""} captured
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-emerald-300 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-900"
                    onClick={() => {
                      const trigger = document.querySelector('[value="build-plan"]') as HTMLElement;
                      trigger?.click();
                    }}
                  >
                    <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                    Generate Build Plan
                  </Button>
                </div>
              );
            }
            return null;
          })()}

          {calls.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No discovery calls yet. Send Rex to a meeting or add notes
              manually.
            </p>
          ) : (
            <div className="space-y-4">
              {calls.map((call) => {
                const data = call.structuredData as any;
                const isBotCall = !!call.recallBotId;
                const isLive =
                  call.status === "IN_PROGRESS" || call.status === "WAITING";

                return (
                  <div
                    key={call.id}
                    className="rounded-lg border p-4 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isBotCall && isLive && (
                          <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                          </span>
                        )}
                        <span className="text-sm font-medium">
                          {call.title ||
                            call.summary ||
                            call.meetingUrl ||
                            "Discovery Entry"}
                        </span>
                        {isBotCall && call.platform && (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {call.platform === "google_meet"
                              ? "Google Meet"
                              : call.platform === "zoom"
                                ? "Zoom"
                                : call.platform === "teams"
                                  ? "Teams"
                                  : call.platform}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {isBotCall && (
                          <span className="text-xs text-muted-foreground">
                            {call._count.insights} insights
                          </span>
                        )}
                        {data?.meetingDate && (
                          <span className="text-xs text-muted-foreground">
                            {new Date(data.meetingDate).toLocaleDateString(
                              "en-US",
                              {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              }
                            )}
                          </span>
                        )}
                        <StatusBadge status={call.status} />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteTarget(call)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span className="sr-only">Delete</span>
                        </Button>
                      </div>
                    </div>

                    {isBotCall &&
                      (isLive || call.status === "COMPLETED") && (
                        <Link
                          href={`/engagements/${engagementId}/discovery/${call.id}/live`}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                        >
                          {isLive
                            ? "Open Live Dashboard"
                            : "View Call Summary"}
                        </Link>
                      )}

                    {data?.attendees && (
                      <p className="text-xs text-muted-foreground">
                        Attendees: {data.attendees}
                      </p>
                    )}
                    {data?.notes && (
                      <div className="rounded bg-muted p-3 text-sm whitespace-pre-wrap">
                        {data.notes}
                      </div>
                    )}
                    {!data?.notes && call.summary && (
                      <p className="text-sm text-muted-foreground">
                        {call.summary}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {new Date(call.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete discovery call?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this discovery call and all associated
              transcript segments and insights. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
