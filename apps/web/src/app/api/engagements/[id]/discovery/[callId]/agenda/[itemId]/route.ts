import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; callId: string; itemId: string } }
) {
  try {
    const item = await prisma.callAgendaItem.findUnique({
      where: { id: params.itemId },
      include: { discoveryCall: { select: { engagementId: true } } },
    });

    if (
      !item ||
      item.discoveryCallId !== params.callId ||
      item.discoveryCall.engagementId !== params.id
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};

    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;
    if (body.status !== undefined) {
      data.status = body.status;
      if (body.status === "RESOLVED" && !item.resolvedAt) {
        data.resolvedAt = new Date();
      }
    }
    if (body.displayOrder !== undefined) data.displayOrder = body.displayOrder;
    if (body.notes !== undefined) data.notes = body.notes;

    const updated = await prisma.callAgendaItem.update({
      where: { id: params.itemId },
      data,
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("Failed to update agenda item:", error);
    return NextResponse.json(
      { error: "Failed to update agenda item" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; callId: string; itemId: string } }
) {
  try {
    const item = await prisma.callAgendaItem.findUnique({
      where: { id: params.itemId },
      include: { discoveryCall: { select: { engagementId: true } } },
    });

    if (
      !item ||
      item.discoveryCallId !== params.callId ||
      item.discoveryCall.engagementId !== params.id
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.callAgendaItem.delete({ where: { id: params.itemId } });
    return NextResponse.json({ deleted: true });
  } catch (error: any) {
    console.error("Failed to delete agenda item:", error);
    return NextResponse.json(
      { error: "Failed to delete agenda item" },
      { status: 500 }
    );
  }
}
