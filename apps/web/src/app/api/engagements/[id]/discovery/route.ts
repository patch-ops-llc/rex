import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const engagement = await prisma.engagement.findUnique({
      where: { id: params.id },
    });

    if (!engagement) {
      return NextResponse.json(
        { error: "Engagement not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { summary, notes, attendees, meetingDate } = body;

    if (!summary) {
      return NextResponse.json(
        { error: "summary is required" },
        { status: 400 }
      );
    }

    const discoveryCall = await prisma.discoveryCall.create({
      data: {
        engagementId: params.id,
        status: "COMPLETED",
        summary,
        structuredData: {
          notes: notes || "",
          attendees: attendees || "",
          meetingDate: meetingDate || null,
          entryType: "manual",
        },
      },
    });

    if (engagement.status === "CREATED" || engagement.status === "SCHEDULED") {
      await prisma.engagement.update({
        where: { id: params.id },
        data: { status: "DISCOVERY" },
      });
    }

    return NextResponse.json(discoveryCall, { status: 201 });
  } catch (error) {
    console.error("Failed to create discovery call:", error);
    return NextResponse.json(
      { error: "Failed to create discovery call" },
      { status: 500 }
    );
  }
}
