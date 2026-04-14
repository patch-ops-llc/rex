import { notFound } from "next/navigation";
import { prisma } from "@rex/shared";
import { StatusBadge } from "@/components/status-badge";
import { DeleteEngagementButton } from "@/components/delete-engagement-button";
import { DiscoveryTab } from "@/components/discovery-tab";
import { BuildPlanTab } from "@/components/build-plan-tab";
import { ScopeTab } from "@/components/scope-tab";
import { PipelineView } from "@/components/pipeline-view";
import { HubSpotConnectionCard } from "@/components/hubspot-connection-card";
import { EngagementContacts } from "@/components/engagement-contacts";
import { WalkthroughsTab } from "@/components/walkthroughs-tab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function EngagementDetailPage({
  params,
}: {
  params: { id: string };
}) {
  let engagement: any = null;
  let pipelineData: any = null;
  let walkthroughs: any[] = [];
  let scopeDocuments: any[] = [];
  let contacts: any[] = [];

  try {
    engagement = await prisma.engagement.findUnique({
      where: { id: params.id },
      include: {
        discoveryCalls: {
          orderBy: { createdAt: "desc" },
          include: {
            _count: { select: { segments: true, insights: true } },
          },
        },
        buildPlan: true,
        implementations: { orderBy: { stepOrder: "asc" } },
        qaItems: { orderBy: { createdAt: "asc" } },
        enablementSessions: true,
        hubspotPortals: {
          select: {
            id: true,
            name: true,
            portalId: true,
            isActive: true,
            lastVerifiedAt: true,
          },
        },
        sow: {
          include: {
            lineItems: { orderBy: { displayOrder: "asc" } },
          },
        },
        scopeAlerts: {
          orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        },
        phases: {
          orderBy: { displayOrder: "asc" },
          include: {
            tasks: { orderBy: { displayOrder: "asc" } },
          },
        },
        deliveryLog: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
        _count: {
          select: {
            conversations: true,
            workRequests: true,
            requirementItems: true,
            uatItems: true,
          },
        },
      },
    });

    if (engagement) {
      walkthroughs = await prisma.walkthrough.findMany({
        where: { engagementId: params.id },
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { steps: true } } },
      });

      scopeDocuments = await prisma.scopeDocument.findMany({
        where: { engagementId: params.id },
        orderBy: { createdAt: "desc" },
      });

      contacts = await prisma.engagementContact.findMany({
        where: { engagementId: params.id },
        orderBy: { createdAt: "desc" },
      });
    }

    if (engagement?.phases?.length > 0) {
      const phases = engagement.phases;
      const activePhase = phases.find((p: any) =>
        ["IN_PROGRESS", "WAITING_ON_CLIENT", "WAITING_ON_APPROVAL", "BLOCKED"].includes(p.status)
      );
      const completedCount = phases.filter(
        (p: any) => p.status === "COMPLETED" || p.status === "SKIPPED"
      ).length;
      const totalTasks = phases.reduce(
        (sum: number, p: any) => sum + p.tasks.length,
        0
      );
      const completedTasks = phases.reduce(
        (sum: number, p: any) =>
          sum +
          p.tasks.filter(
            (t: any) => t.status === "COMPLETED" || t.status === "SKIPPED"
          ).length,
        0
      );
      const blockedTasks = phases.reduce(
        (sum: number, p: any) =>
          sum + p.tasks.filter((t: any) => t.status === "FAILED").length,
        0
      );

      pipelineData = {
        phases,
        activePhase: activePhase ?? null,
        progress: {
          completedPhases: completedCount,
          totalPhases: phases.length,
          completedTasks,
          totalTasks,
          blockedTasks,
          percentComplete:
            phases.length > 0
              ? Math.round((completedCount / phases.length) * 100)
              : 0,
        },
      };
    }
  } catch {
    // DB not connected
  }

  if (!engagement) {
    notFound();
  }

  const openAlerts = engagement.scopeAlerts?.filter(
    (a: any) => a.status === "OPEN" || a.status === "ACKNOWLEDGED"
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {engagement.name}
          </h1>
          <p className="text-muted-foreground">
            {engagement.clientName}
            {engagement.industry && ` · ${engagement.industry}`}
            {engagement.hubspotTier &&
              ` · HubSpot ${engagement.hubspotTier}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={engagement.status} />
          <DeleteEngagementButton
            engagementId={engagement.id}
            engagementName={engagement.name}
          />
        </div>
      </div>

      <HubSpotConnectionCard
        engagementId={engagement.id}
        linkedPortals={engagement.hubspotPortals ?? []}
      />

      <EngagementContacts
        engagementId={engagement.id}
        initialContacts={contacts}
      />

      <Tabs defaultValue="pipeline">
        <TabsList>
          <TabsTrigger value="pipeline">
            Pipeline
            {pipelineData?.progress && pipelineData.progress.totalPhases > 0 && (
              <span className="ml-1.5 text-xs text-muted-foreground">
                ({pipelineData.progress.percentComplete}%)
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="scope">
            Scope
            {openAlerts?.length > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
                {openAlerts.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="discovery">
            Discovery
            {engagement.discoveryCalls.length > 0 && (
              <span className="ml-1.5 text-xs text-muted-foreground">
                ({engagement.discoveryCalls.length})
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="build-plan">Build Plan</TabsTrigger>
          <TabsTrigger value="implementation">Implementation</TabsTrigger>
          <TabsTrigger value="qa">QA</TabsTrigger>
          <TabsTrigger value="walkthroughs">
            Walkthroughs
            {walkthroughs.length > 0 && (
              <span className="ml-1.5 text-xs text-muted-foreground">
                ({walkthroughs.length})
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        {/* ── Pipeline Tab ─────────────────────────────────────────── */}
        <TabsContent value="pipeline">
          <PipelineView
            engagementId={engagement.id}
            phases={pipelineData?.phases || []}
            progress={
              pipelineData?.progress || {
                completedPhases: 0,
                totalPhases: 0,
                completedTasks: 0,
                totalTasks: 0,
                blockedTasks: 0,
                percentComplete: 0,
              }
            }
            activePhase={pipelineData?.activePhase || null}
            hasSow={!!engagement.sow}
            hasPortal={engagement.hubspotPortals?.some((p: any) => p.isActive) ?? false}
          />
        </TabsContent>

        {/* ── Scope Tab ────────────────────────────────────────────── */}
        <TabsContent value="scope">
          <ScopeTab
            engagementId={engagement.id}
            sow={
              engagement.sow
                ? {
                    ...engagement.sow,
                    totals: {
                      allocatedHours: engagement.sow.lineItems.reduce(
                        (sum: number, li: any) => sum + li.allocatedHours,
                        0
                      ),
                      consumedHours: engagement.sow.lineItems.reduce(
                        (sum: number, li: any) => sum + li.consumedHours,
                        0
                      ),
                      allocatedBudget: engagement.sow.lineItems.reduce(
                        (sum: number, li: any) =>
                          sum + li.allocatedHours * li.hourlyRate,
                        0
                      ),
                      consumedBudget: engagement.sow.lineItems.reduce(
                        (sum: number, li: any) =>
                          sum + li.consumedHours * li.hourlyRate,
                        0
                      ),
                    },
                  }
                : null
            }
            scopeAlerts={engagement.scopeAlerts || []}
            scopeDocuments={scopeDocuments}
          />
        </TabsContent>

        {/* ── Discovery Tab ────────────────────────────────────────── */}
        <TabsContent value="discovery">
          <DiscoveryTab
            engagementId={engagement.id}
            clientName={engagement.clientName}
            hasBuildPlan={!!engagement.buildPlan}
            initialCalls={engagement.discoveryCalls.map((call: any) => ({
              ...call,
              createdAt: call.createdAt.toISOString(),
            }))}
          />
        </TabsContent>

        {/* ── Build Plan Tab ───────────────────────────────────────── */}
        <TabsContent value="build-plan">
          <BuildPlanTab
            engagementId={engagement.id}
            buildPlan={
              engagement.buildPlan
                ? {
                    id: engagement.buildPlan.id,
                    version: engagement.buildPlan.version,
                    status: engagement.buildPlan.status,
                    planData: engagement.buildPlan.planData,
                    createdAt: engagement.buildPlan.createdAt.toISOString(),
                    updatedAt: engagement.buildPlan.updatedAt.toISOString(),
                  }
                : null
            }
            completedCallCount={
              engagement.discoveryCalls.filter(
                (c: any) => c.status === "COMPLETED"
              ).length
            }
            totalInsightCount={engagement.discoveryCalls.reduce(
              (sum: number, c: any) => sum + (c._count?.insights || 0),
              0
            )}
            requirementCount={engagement._count?.requirementItems || 0}
            hasActivePortal={engagement.hubspotPortals?.some((p: any) => p.isActive) ?? false}
          />
        </TabsContent>

        {/* ── Implementation Tab ───────────────────────────────────── */}
        <TabsContent value="implementation">
          <Card>
            <CardHeader>
              <CardTitle>Implementation</CardTitle>
              <CardDescription>
                HubSpot portal configuration progress.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {engagement.implementations.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No implementation steps yet. Approve a build plan to start.
                </p>
              ) : (
                <div className="space-y-2">
                  {engagement.implementations.map((step: any) => (
                    <div
                      key={step.id}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div>
                        <span className="text-sm font-medium">
                          {step.stepName}
                        </span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {step.stepType}
                        </span>
                      </div>
                      <StatusBadge status={step.status} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── QA Tab ───────────────────────────────────────────────── */}
        <TabsContent value="qa">
          <Card>
            <CardHeader>
              <CardTitle>QA Checklist</CardTitle>
              <CardDescription>
                Verification items for the implementation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {engagement.qaItems.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No QA items yet. They will be generated after implementation.
                </p>
              ) : (
                <div className="space-y-2">
                  {engagement.qaItems.map((item: any) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div>
                        <span className="text-sm font-medium">
                          {item.description}
                        </span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {item.category}
                        </span>
                      </div>
                      <StatusBadge status={item.status} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Walkthroughs Tab ────────────────────────────────────── */}
        <TabsContent value="walkthroughs">
          <WalkthroughsTab
            engagementId={engagement.id}
            hasBuildPlan={!!engagement.buildPlan}
            initialWalkthroughs={walkthroughs.map((w: any) => ({
              id: w.id,
              title: w.title,
              description: w.description,
              status: w.status,
              shareToken: w.shareToken,
              generatedAt: w.generatedAt?.toISOString() ?? null,
              createdAt: w.createdAt.toISOString(),
              _count: w._count,
            }))}
          />
        </TabsContent>

        {/* ── Activity Log Tab ─────────────────────────────────────── */}
        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle>Delivery Activity</CardTitle>
              <CardDescription>
                Audit trail of all pipeline actions, phase transitions, and task
                completions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(!engagement.deliveryLog ||
                engagement.deliveryLog.length === 0) ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No activity yet. Initialize the pipeline to start tracking.
                </p>
              ) : (
                <div className="space-y-2">
                  {engagement.deliveryLog.map((entry: any) => (
                    <div
                      key={entry.id}
                      className="flex items-start gap-3 py-2 border-b last:border-0"
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground mt-2 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">{entry.description}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">
                            {new Date(entry.createdAt).toLocaleDateString(
                              "en-US",
                              {
                                month: "short",
                                day: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                              }
                            )}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            · {entry.actor}
                          </span>
                          {entry.phaseType && (
                            <span className="text-xs text-muted-foreground">
                              · {entry.phaseType}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
