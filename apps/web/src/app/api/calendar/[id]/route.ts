import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.calendarAccount.update({
      where: { id: params.id },
      data: { isActive: false },
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to disconnect calendar" },
      { status: 500 }
    );
  }
}
