import { NextResponse } from "next/server";
import { prisma } from "@rex/shared";

export async function GET() {
  try {
    const [
      totalEngagements,
      activeEngagements,
      managedClients,
      corpusEntries,
      recentEngagements,
    ] = await Promise.all([
      prisma.engagement.count(),
      prisma.engagement.count({
        where: {
          status: {
            notIn: ["CREATED", "COMPLETE"],
          },
        },
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

    return NextResponse.json({
      totalEngagements,
      activeEngagements,
      managedClients,
      corpusEntries,
      recentEngagements,
    });
  } catch (error) {
    console.error("Failed to fetch dashboard stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard stats" },
      { status: 500 }
    );
  }
}
