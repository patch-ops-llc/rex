import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const documents = await prisma.scopeDocument.findMany({
      where: { engagementId: params.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(documents);
  } catch (error) {
    console.error("Failed to fetch scope documents:", error);
    return NextResponse.json(
      { error: "Failed to fetch scope documents" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get("documentId");

    if (!documentId) {
      return NextResponse.json(
        { error: "documentId query parameter is required" },
        { status: 400 }
      );
    }

    const doc = await prisma.scopeDocument.findFirst({
      where: { id: documentId, engagementId: params.id },
    });

    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    await prisma.scopeDocument.delete({ where: { id: documentId } });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Failed to delete scope document:", error);
    return NextResponse.json(
      { error: "Failed to delete scope document" },
      { status: 500 }
    );
  }
}
