import { NextResponse } from "next/server";
import { prisma } from "@rex/shared";

export async function GET() {
  try {
    const workspaces = await prisma.slackWorkspace.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        teamId: true,
        teamName: true,
        botUserId: true,
        scope: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(workspaces);
  } catch (error) {
    console.error("Failed to fetch Slack workspaces:", error);
    return NextResponse.json(
      { error: "Failed to fetch workspaces" },
      { status: 500 }
    );
  }
}
