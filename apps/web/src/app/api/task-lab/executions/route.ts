import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clickupTaskId = searchParams.get("clickupTaskId");
    const connectionId = searchParams.get("connectionId");

    const where: any = {};
    if (clickupTaskId) where.clickupTaskId = clickupTaskId;
    if (connectionId) where.connectionId = connectionId;

    const limitParam = parseInt(searchParams.get("limit") || "50", 10);
    const take = Math.min(Math.max(limitParam, 1), 200);

    const executions = await prisma.taskExecution.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        clickupTaskId: true,
        taskName: true,
        portalId: true,
        hubspotPortalId: true,
        mode: true,
        status: true,
        plan: true,
        results: true,
        errorMessage: true,
        createdAt: true,
        completedAt: true,
      },
    });

    return NextResponse.json({ executions });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to load executions" },
      { status: 500 }
    );
  }
}
