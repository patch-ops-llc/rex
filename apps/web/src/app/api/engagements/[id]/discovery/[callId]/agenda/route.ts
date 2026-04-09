import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string; callId: string } }
) {
  try {
    const call = await prisma.discoveryCall.findUnique({
      where: { id: params.callId },
      select: { engagementId: true },
    });

    if (!call || call.engagementId !== params.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const items = await prisma.callAgendaItem.findMany({
      where: { discoveryCallId: params.callId },
      orderBy: { displayOrder: "asc" },
    });

    return NextResponse.json(items);
  } catch (error: any) {
    console.error("Failed to fetch agenda:", error);
    return NextResponse.json(
      { error: "Failed to fetch agenda" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; callId: string } }
) {
  try {
    const call = await prisma.discoveryCall.findUnique({
      where: { id: params.callId },
      select: { engagementId: true },
    });

    if (!call || call.engagementId !== params.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    const items: Array<{ title: string; description?: string }> = Array.isArray(body)
      ? body
      : [body];

    if (!items.length || !items.every((i) => i.title?.trim())) {
      return NextResponse.json(
        { error: "Each item requires a title" },
        { status: 400 }
      );
    }

    const maxOrder = await prisma.callAgendaItem.aggregate({
      where: { discoveryCallId: params.callId },
      _max: { displayOrder: true },
    });
    const startOrder = (maxOrder._max.displayOrder ?? -1) + 1;

    const created = await prisma.$transaction(
      items.map((item, idx) =>
        prisma.callAgendaItem.create({
          data: {
            discoveryCallId: params.callId,
            title: item.title.trim(),
            description: item.description?.trim() || null,
            displayOrder: startOrder + idx,
          },
        })
      )
    );

    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    console.error("Failed to create agenda items:", error);
    return NextResponse.json(
      { error: "Failed to create agenda items" },
      { status: 500 }
    );
  }
}
