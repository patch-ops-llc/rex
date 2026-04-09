import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const filter = searchParams.get("filter") || "all";

  try {
    const where =
      filter === "unassociated"
        ? { engagementId: null }
        : filter === "associated"
          ? { engagementId: { not: null } }
          : {};

    const calls = await prisma.discoveryCall.findMany({
      where,
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

    return NextResponse.json(calls);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch calls" },
      { status: 500 }
    );
  }
}
