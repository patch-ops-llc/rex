import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    await prisma.slackWorkspace.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }
    console.error("Failed to delete Slack workspace:", error);
    return NextResponse.json(
      { error: "Failed to remove workspace" },
      { status: 500 }
    );
  }
}
