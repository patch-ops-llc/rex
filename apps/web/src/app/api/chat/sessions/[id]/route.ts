import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await prisma.chatSession.findUnique({
      where: { id: params.id },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: session.id,
      title: session.title,
      messages: session.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        toolActivity: m.toolActivity,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error("Failed to get chat session:", err);
    return NextResponse.json({ error: "Failed to get session" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.chatSession.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to delete chat session:", err);
    return NextResponse.json({ error: "Failed to delete session" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json();

  try {
    const session = await prisma.chatSession.update({
      where: { id: params.id },
      data: { title: body.title },
    });

    return NextResponse.json({ id: session.id, title: session.title });
  } catch (err) {
    console.error("Failed to update chat session:", err);
    return NextResponse.json({ error: "Failed to update session" }, { status: 500 });
  }
}
