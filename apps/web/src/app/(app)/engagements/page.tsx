import { prisma } from "@rex/shared";
import { CreateEngagementDialog } from "@/components/create-engagement-dialog";
import { EngagementCard } from "@/components/engagement-card";

export default async function EngagementsPage() {
  let engagements: any[] = [];
  try {
    engagements = await prisma.engagement.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: {
            discoveryCalls: true,
            implementations: true,
            qaItems: true,
          },
        },
      },
    });
  } catch {
    // DB not connected yet — show empty state
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Engagements</h1>
          <p className="text-muted-foreground">
            Manage client engagements from discovery to ongoing support.
          </p>
        </div>
        <CreateEngagementDialog />
      </div>

      {engagements.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <h3 className="text-lg font-semibold">No engagements yet</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Create your first engagement to start the discovery process.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {engagements.map((engagement) => (
            <EngagementCard
              key={engagement.id}
              engagement={{
                ...engagement,
                createdAt: engagement.createdAt.toISOString(),
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
