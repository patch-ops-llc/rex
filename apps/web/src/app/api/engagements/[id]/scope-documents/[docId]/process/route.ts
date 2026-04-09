import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";
import { processScopeDocument } from "@/lib/scope-processor";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string; docId: string } }
) {
  try {
    const doc = await prisma.scopeDocument.findFirst({
      where: { id: params.docId, engagementId: params.id },
      select: { id: true, status: true, rawText: true },
    });

    if (!doc) {
      return NextResponse.json(
        { error: "Scope document not found" },
        { status: 404 }
      );
    }

    if (!doc.rawText) {
      return NextResponse.json(
        { error: "Document has not been parsed yet" },
        { status: 400 }
      );
    }

    if (doc.status === "PROCESSING") {
      return NextResponse.json(
        { error: "Document is already being processed" },
        { status: 409 }
      );
    }

    const result = await processScopeDocument(doc.id);

    return NextResponse.json(result);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("Scope document processing failed:", detail, error);
    return NextResponse.json(
      { error: `Processing failed: ${detail}` },
      { status: 500 }
    );
  }
}
