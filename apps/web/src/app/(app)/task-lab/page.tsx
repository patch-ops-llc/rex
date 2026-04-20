import { prisma } from "@rex/shared";
import { TaskLabView } from "@/components/task-lab/task-lab-view";

export default async function TaskLabPage() {
  let connections: any[] = [];
  let portals: any[] = [];

  try {
    connections = await prisma.clickUpConnection.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        listId: true,
        completionStatus: true,
        isActive: true,
        lastSyncAt: true,
        createdAt: true,
      },
    });
  } catch {
    // DB not connected
  }

  try {
    portals = await prisma.hubSpotPortal.findMany({
      orderBy: { createdAt: "desc" },
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        portalId: true,
      },
    });
  } catch {
    // DB not connected
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Task Lab</h1>
        <p className="text-muted-foreground">
          Pressure-test ClickUp tasks against a HubSpot portal. Load a list,
          let Rex generate an execution plan, dry-run it, then execute live
          when you&apos;re ready.
        </p>
      </div>

      <TaskLabView initialConnections={connections} portals={portals} />
    </div>
  );
}
