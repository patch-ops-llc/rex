import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";
import { syncUpcomingEvents } from "@/lib/google-calendar";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const accounts = await prisma.calendarAccount.findMany({
      where: { isActive: true },
    });

    const results: Record<string, any> = {};

    for (const account of accounts) {
      try {
        results[account.email] = await syncUpcomingEvents(account.id);
      } catch (err: any) {
        console.error(`Calendar sync failed for ${account.email}:`, err);
        results[account.email] = { error: err.message };
      }
    }

    return NextResponse.json({ synced: Object.keys(results).length, results });
  } catch (error: any) {
    console.error("Calendar sync error:", error);
    return NextResponse.json(
      { error: error.message || "Sync failed" },
      { status: 500 }
    );
  }
}
