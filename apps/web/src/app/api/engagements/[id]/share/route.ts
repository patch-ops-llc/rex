import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";
import { randomBytes } from "crypto";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const engagement = await prisma.engagement.findUnique({
      where: { id: params.id },
      select: { id: true, shareToken: true },
    });

    if (!engagement) {
      return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
    }

    if (engagement.shareToken) {
      return NextResponse.json({ shareToken: engagement.shareToken });
    }

    const token = randomBytes(16).toString("hex");
    await prisma.engagement.update({
      where: { id: params.id },
      data: { shareToken: token },
    });

    return NextResponse.json({ shareToken: token }, { status: 201 });
  } catch (error: any) {
    console.error("Failed to generate share token:", error);
    return NextResponse.json({ error: "Failed to generate share link" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    await prisma.engagement.update({
      where: { id: params.id },
      data: { shareToken: null },
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Failed to remove share token:", error);
    return NextResponse.json({ error: "Failed to remove share link" }, { status: 500 });
  }
}
