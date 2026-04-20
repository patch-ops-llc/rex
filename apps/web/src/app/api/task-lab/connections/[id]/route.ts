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
