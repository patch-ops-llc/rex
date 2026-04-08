import { NextRequest, NextResponse } from "next/server";
import { prisma, SUPPORTED_SCOPE_FILE_TYPES } from "@rex/shared";
import pdf from "pdf-parse";
import mammoth from "mammoth";

const MIME_TO_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/csv": "csv",
};

async function extractText(
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  switch (mimeType) {
    case "application/pdf": {
      const data = await pdf(buffer);
      return data.text;
    }
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
    case "text/plain":
    case "text/markdown":
    case "text/csv":
      return buffer.toString("utf-8");
    default:
      throw new Error(`Unsupported file type: ${mimeType}`);
  }
}

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

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const mimeType = file.type;
    if (!(SUPPORTED_SCOPE_FILE_TYPES as readonly string[]).includes(mimeType)) {
      return NextResponse.json(
        {
          error: `Unsupported file type: ${mimeType}. Supported: PDF, DOCX, TXT, MD, CSV`,
        },
        { status: 400 }
      );
    }

    const doc = await prisma.scopeDocument.create({
      data: {
        engagementId: params.id,
        fileName: file.name,
        fileType: mimeType,
        fileSizeBytes: file.size,
        status: "PARSING",
      },
    });

    try {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const rawText = await extractText(buffer, mimeType);

      const updated = await prisma.scopeDocument.update({
        where: { id: doc.id },
        data: { rawText, status: "PARSED" },
      });

      return NextResponse.json(updated, { status: 201 });
    } catch (parseError) {
      const message =
        parseError instanceof Error ? parseError.message : "Parse failed";
      await prisma.scopeDocument.update({
        where: { id: doc.id },
        data: { status: "FAILED", errorMessage: message },
      });
      return NextResponse.json(
        { error: `Failed to parse file: ${message}` },
        { status: 422 }
      );
    }
  } catch (error) {
    console.error("Failed to upload scope document:", error);
    return NextResponse.json(
      { error: "Failed to upload scope document" },
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
