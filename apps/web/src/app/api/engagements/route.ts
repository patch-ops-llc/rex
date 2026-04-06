import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";

export async function GET() {
  try {
    const engagements = await prisma.engagement.findMany({
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
    return NextResponse.json(engagements);
  } catch (error) {
    console.error("Failed to fetch engagements:", error);
    return NextResponse.json(
      { error: "Failed to fetch engagements" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, clientName, industry, hubspotTier } = body;

    if (!name || !clientName) {
      return NextResponse.json(
        { error: "name and clientName are required" },
        { status: 400 }
      );
    }

    const engagement = await prisma.engagement.create({
      data: {
        name,
        clientName,
        industry: industry || null,
        hubspotTier: hubspotTier || null,
      },
    });

    return NextResponse.json(engagement, { status: 201 });
  } catch (error) {
    console.error("Failed to create engagement:", error);
    return NextResponse.json(
      { error: "Failed to create engagement" },
      { status: 500 }
    );
  }
}
