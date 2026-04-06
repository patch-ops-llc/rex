import { notFound } from "next/navigation";
import { prisma } from "@rex/shared";
import { StatusBadge } from "@/components/status-badge";
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
  try {
    engagement = await prisma.engagement.findUnique({
      where: { id: params.id },
      include: {
        discoveryCalls: { orderBy: { createdAt: "desc" } },
        buildPlan: true,
        implementations: { orderBy: { stepOrder: "asc" } },
        qaItems: { orderBy: { createdAt: "asc" } },
        enablementSessions: true,
        _count: {
          select: { conversations: true, workRequests: true },
        },
      },
    });
  } catch {
    // DB not connected
  }

  if (!engagement) {
    notFound();
  }

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
        <StatusBadge status={engagement.status} />
      </div>

      <Tabs defaultValue="discovery">
        <TabsList>
          <TabsTrigger value="discovery">Discovery</TabsTrigger>
          <TabsTrigger value="build-plan">Build Plan</TabsTrigger>
          <TabsTrigger value="implementation">Implementation</TabsTrigger>
          <TabsTrigger value="qa">QA</TabsTrigger>
        </TabsList>

        <TabsContent value="discovery">
          <Card>
            <CardHeader>
              <CardTitle>Discovery</CardTitle>
              <CardDescription>
                Discovery calls and captured requirements for this engagement.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {engagement.discoveryCalls.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No discovery calls yet. Schedule a discovery call or enter
                  requirements manually.
                </p>
              ) : (
                <div className="space-y-4">
                  {engagement.discoveryCalls.map((call: any) => (
                    <div
                      key={call.id}
                      className="rounded-lg border p-4 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          {call.meetingUrl || "Manual Entry"}
                        </span>
                        <StatusBadge status={call.status} />
                      </div>
                      {call.summary && (
                        <p className="text-sm text-muted-foreground">
                          {call.summary}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="build-plan">
          <Card>
            <CardHeader>
              <CardTitle>Build Plan</CardTitle>
              <CardDescription>
                AI-generated implementation plan from discovery output.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {engagement.buildPlan ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      Version {engagement.buildPlan.version}
                    </span>
                    <StatusBadge status={engagement.buildPlan.status} />
                  </div>
                  <pre className="rounded-lg bg-muted p-4 text-xs overflow-auto max-h-96">
                    {JSON.stringify(engagement.buildPlan.planData, null, 2)}
                  </pre>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No build plan generated yet. Complete discovery first.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

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
      </Tabs>
    </div>
  );
}
