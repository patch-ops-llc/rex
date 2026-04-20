import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.clickUpConnection.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to delete" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const data: Record<string, any> = {};
    if (typeof body.name === "string" && body.name.trim().length > 0) {
      data.name = body.name.trim();
    }
    if (typeof body.listId === "string" && body.listId.trim().length > 0) {
      data.listId = body.listId.trim();
    }
    if (body.completionStatus === null) {
      data.completionStatus = null;
    } else if (typeof body.completionStatus === "string") {
      const trimmed = body.completionStatus.trim();
      data.completionStatus = trimmed.length > 0 ? trimmed : null;
    }
    if (typeof body.isActive === "boolean") {
      data.isActive = body.isActive;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No updatable fields provided" },
        { status: 400 }
      );
    }
    const conn = await prisma.clickUpConnection.update({
      where: { id: params.id },
      data,
      select: {
        id: true,
        name: true,
        listId: true,
        completionStatus: true,
        isActive: true,
        lastSyncAt: true,
        createdAt: true,
      },
    });
    return NextResponse.json(conn);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to update connection" },
      { status: 500 }
    );
  }
}
