import { prisma } from "@rex/shared";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";

export default async function DashboardPage() {
  let stats = {
    totalEngagements: 0,
    activeEngagements: 0,
    managedClients: 0,
    corpusEntries: 0,
    recentEngagements: [] as any[],
  };

  try {
    const [total, active, managed, corpus, recent] = await Promise.all([
      prisma.engagement.count(),
      prisma.engagement.count({
        where: { status: { notIn: ["CREATED", "COMPLETE"] } },
      }),
      prisma.engagement.count({
        where: { status: "ACTIVE_SUPPORT" },
      }),
      prisma.corpusEntry.count(),
      prisma.engagement.findMany({
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: {
          id: true,
          name: true,
          clientName: true,
          status: true,
          updatedAt: true,
        },
      }),
    ]);

    stats = {
      totalEngagements: total,
      activeEngagements: active,
      managedClients: managed,
      corpusEntries: corpus,
      recentEngagements: recent,
    };
  } catch {
    // DB not connected
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          REX platform overview and metrics.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Engagements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalEngagements}</div>
            <p className="text-xs text-muted-foreground">
              Across all statuses
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeEngagements}</div>
            <p className="text-xs text-muted-foreground">
              Currently in progress
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Managed Clients
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.managedClients}</div>
            <p className="text-xs text-muted-foreground">
              Active support tier
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Corpus Entries
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.corpusEntries}</div>
            <p className="text-xs text-muted-foreground">
              Training transcripts
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>
            Latest engagement updates across the platform.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stats.recentEngagements.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No activity yet. Create your first engagement to get started.
            </p>
          ) : (
            <div className="space-y-3">
              {stats.recentEngagements.map((engagement) => (
                <Link
                  key={engagement.id}
                  href={`/engagements/${engagement.id}`}
                  className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent transition-colors"
                >
                  <div>
                    <span className="text-sm font-medium">
                      {engagement.name}
                    </span>
                    <p className="text-xs text-muted-foreground">
                      {engagement.clientName}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {new Date(engagement.updatedAt).toLocaleDateString(
                        "en-US",
                        { month: "short", day: "numeric" }
                      )}
                    </span>
                    <StatusBadge status={engagement.status} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
