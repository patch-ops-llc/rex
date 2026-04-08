import pdf from "pdf-parse";
import mammoth from "mammoth";
import { SUPPORTED_SCOPE_FILE_TYPES } from "@rex/shared";
import type { SupportedScopeFileType } from "@rex/shared";

export function isSupportedFileType(
  mimeType: string
): mimeType is SupportedScopeFileType {
  return (SUPPORTED_SCOPE_FILE_TYPES as readonly string[]).includes(mimeType);
}

export async function extractText(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<string> {
  switch (mimeType) {
    case "application/pdf":
      return extractPdfText(buffer);

    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return extractDocxText(buffer);

    case "text/plain":
    case "text/markdown":
    case "text/csv":
      return buffer.toString("utf-8");

    default:
      throw new Error(
        `Unsupported file type: ${mimeType} (${fileName})`
      );
  }
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const data = await pdf(buffer);
  return data.text;
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}
