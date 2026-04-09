import { prisma } from "@rex/shared";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { CallAssignButton } from "@/components/call-assign-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

export default async function CallsPage() {
  let allCalls: any[] = [];
  let engagements: any[] = [];

  try {
    allCalls = await prisma.discoveryCall.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        engagement: {
          select: { id: true, name: true, clientName: true },
        },
        calendarEvent: {
          select: { title: true, attendeeEmails: true, organizerEmail: true },
        },
        _count: { select: { segments: true, insights: true } },
      },
    });

    engagements = await prisma.engagement.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, clientName: true },
    });
  } catch {
    // DB not connected
  }

  const unassociated = allCalls.filter((c) => !c.engagementId);
  const associated = allCalls.filter((c) => !!c.engagementId);

  function renderCallList(calls: any[], showAssign: boolean) {
    if (calls.length === 0) {
      return (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No calls to show.
        </p>
      );
    }

    return (
      <div className="space-y-3">
        {calls.map((call: any) => {
          const isLive =
            call.status === "IN_PROGRESS" || call.status === "WAITING";

          return (
            <div
              key={call.id}
              className="rounded-lg border p-4 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isLive && (
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                    </span>
                  )}
                  <span className="text-sm font-medium">
                    {call.title || call.calendarEvent?.title || "Untitled Call"}
                  </span>
                  {call.platform && (
                    <Badge variant="secondary" className="text-[10px]">
                      {call.platform === "google_meet"
                        ? "Google Meet"
                        : call.platform === "zoom"
                          ? "Zoom"
                          : call.platform === "teams"
                            ? "Teams"
                            : call.platform}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {call._count.insights > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {call._count.insights} insights
                    </span>
                  )}
                  <StatusBadge status={call.status} />
                </div>
              </div>

              {call.engagement && (
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-xs">
                    <Link href={`/engagements/${call.engagement.id}`}>
                      {call.engagement.name}
                    </Link>
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {call.engagement.clientName}
                  </span>
                </div>
              )}

              {call.attendeeEmails?.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Attendees: {call.attendeeEmails.join(", ")}
                </p>
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {new Date(call.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                  {call.duration && (
                    <span className="text-xs text-muted-foreground">
                      {Math.round(call.duration / 60)} min
                    </span>
                  )}
                  {call.engagementId && (isLive || call.status === "COMPLETED") && (
                    <Link
                      href={`/engagements/${call.engagementId}/discovery/${call.id}/live`}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      {isLive ? "Open Live Dashboard" : "View Call Summary"}
                    </Link>
                  )}
                </div>

                {showAssign && !call.engagementId && (
                  <CallAssignButton
                    callId={call.id}
                    engagements={engagements.map((e: any) => ({
                      id: e.id,
                      label: `${e.name} (${e.clientName})`,
                    }))}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Calls</h1>
        <p className="text-muted-foreground">
          All recorded meetings across engagements. Unassociated calls can be
          assigned to engagements manually.
        </p>
      </div>

      <Tabs defaultValue={unassociated.length > 0 ? "unassociated" : "all"}>
        <TabsList>
          <TabsTrigger value="all">
            All Calls
            <span className="ml-1.5 text-xs text-muted-foreground">
              ({allCalls.length})
            </span>
          </TabsTrigger>
          <TabsTrigger value="unassociated">
            Unassociated
            {unassociated.length > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-100 px-1 text-[10px] font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                {unassociated.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="associated">
            Associated
            <span className="ml-1.5 text-xs text-muted-foreground">
              ({associated.length})
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <Card>
            <CardHeader>
              <CardTitle>All Calls</CardTitle>
              <CardDescription>
                Every meeting Rex has joined, across all engagements.
              </CardDescription>
            </CardHeader>
            <CardContent>{renderCallList(allCalls, true)}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="unassociated">
          <Card>
            <CardHeader>
              <CardTitle>Unassociated Calls</CardTitle>
              <CardDescription>
                Meetings where no attendee matched an engagement contact. Assign
                them manually or add contacts to engagements for future auto-matching.
              </CardDescription>
            </CardHeader>
            <CardContent>{renderCallList(unassociated, true)}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="associated">
          <Card>
            <CardHeader>
              <CardTitle>Associated Calls</CardTitle>
              <CardDescription>
                Meetings that were auto-matched or manually assigned to engagements.
              </CardDescription>
            </CardHeader>
            <CardContent>{renderCallList(associated, false)}</CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
