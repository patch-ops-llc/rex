import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";

export async function GET(request: NextRequest) {
  const userId = request.headers.get("x-user-id") || "default";

  try {
    const sessions = await prisma.chatSession.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          take: 1,
          where: { role: "user" },
        },
      },
    });

    const result = sessions.map((s) => ({
      id: s.id,
      title: s.title || s.messages[0]?.content?.slice(0, 80) || "New conversation",
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    }));

    return NextResponse.json(result);
  } catch (err) {
    console.error("Failed to list chat sessions:", err);
    return NextResponse.json({ error: "Failed to list sessions" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const userId = request.headers.get("x-user-id") || "default";
  const body = await request.json();

  try {
    const session = await prisma.chatSession.create({
      data: {
        userId,
        title: body.title || null,
      },
    });

    return NextResponse.json({ id: session.id });
  } catch (err) {
    console.error("Failed to create chat session:", err);
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }
}
