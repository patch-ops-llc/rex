import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";

export async function GET(
  _request: NextRequest,
  { params }: { params: { shareToken: string } },
) {
  try {
    const engagement = await prisma.engagement.findUnique({
      where: { shareToken: params.shareToken },
      select: {
        id: true,
        name: true,
        clientName: true,
        industry: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        phases: {
          orderBy: { displayOrder: "asc" },
          select: {
            id: true,
            phaseType: true,
            status: true,
            displayOrder: true,
            startedAt: true,
            completedAt: true,
            tasks: {
              orderBy: { displayOrder: "asc" },
              select: {
                id: true,
                title: true,
                description: true,
                status: true,
                taskType: true,
                assignedTo: true,
                dueAt: true,
                completedAt: true,
              },
            },
          },
        },
        implementations: {
          orderBy: { stepOrder: "asc" },
          select: {
            stepName: true,
            stepType: true,
            status: true,
            executedAt: true,
          },
        },
        deliveryLog: {
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            action: true,
            description: true,
            phaseType: true,
            actor: true,
            createdAt: true,
          },
        },
      },
    });

    if (!engagement) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const phases = engagement.phases;
    const completedPhases = phases.filter((p) =>
      p.status === "COMPLETED" || p.status === "SKIPPED"
    ).length;
    const totalTasks = phases.reduce((s, p) => s + p.tasks.length, 0);
    const completedTasks = phases.reduce(
      (s, p) => s + p.tasks.filter((t) => t.status === "COMPLETED" || t.status === "SKIPPED").length,
      0,
    );
    const activePhase = phases.find((p) =>
      ["IN_PROGRESS", "WAITING_ON_CLIENT", "WAITING_ON_APPROVAL", "BLOCKED"].includes(p.status)
    );

    return NextResponse.json({
      ...engagement,
      progress: {
        completedPhases,
        totalPhases: phases.length,
        completedTasks,
        totalTasks,
        percentComplete: phases.length > 0 ? Math.round((completedPhases / phases.length) * 100) : 0,
        activePhaseType: activePhase?.phaseType || null,
      },
    });
  } catch (error: any) {
    console.error("Failed to fetch project:", error);
    return NextResponse.json({ error: "Failed to fetch project" }, { status: 500 });
  }
}
