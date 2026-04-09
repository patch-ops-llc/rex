import Anthropic from "@anthropic-ai/sdk";
import { prisma, log } from "@rex/shared";
import type { ParsedScopeData } from "@rex/shared";
import type { Prisma } from "@prisma/client";

const anthropic = new Anthropic();
const SERVICE = "scope-processor";

const SYSTEM_PROMPT = `You are an AI assistant for PatchOps, a consulting firm specializing in CRM implementations, system integrations, and business automation. You are processing an uploaded Statement of Work (SOW), proposal, or scope document.

Your job is to extract structured scope data from the document text. This will be used to:
1. Auto-populate the engagement's SOW with workstreams, hours, and rates
2. Establish the scope baseline for discovery calls
3. Detect scope creep during the engagement

Extract the following into valid JSON matching this schema:

{
  "title": "Document title or engagement name",
  "clientName": "Client/company name if found",
  "workstreams": [
    {
      "name": "Workstream name (e.g. 'Systems Optimization', 'Sales Support')",
      "description": "Brief description of what this workstream covers",
      "allocatedHours": 40,
      "rateTier": "TIER_1 | TIER_2 | TIER_3",
      "hourlyRate": 100,
      "deliverables": ["Specific deliverable 1", "Specific deliverable 2"]
    }
  ],
  "totalHours": 120,
  "totalBudget": 12000,
  "startDate": "2026-04-01",
  "endDate": "2026-09-30",
  "paymentTerms": "Net 15, invoiced monthly",
  "outOfScope": ["Item explicitly excluded from scope"],
  "assumptions": ["Key assumption the scope depends on"],
  "rawSections": {
    "section_name": "Full text of identifiable sections for reference"
  }
}

Rate tier mapping (PatchOps standard):
- TIER_1 ($100/hr): Custom code, integrations, API development, architecture, complex migrations
- TIER_2 ($85/hr): Complex reporting, custom objects, multi-step workflows, no-code integrations
- TIER_3 ($75/hr): Pipeline setup, basic reporting, lead scoring, training, form creation

Rules:
- Extract ALL workstreams/line items you can identify, even if hours aren't specified for each
- If rates aren't explicitly stated, infer the tier from the work description
- If total hours or budget are stated, include them even if individual workstream hours don't sum to them
- Capture out-of-scope items and assumptions — these are critical for scope creep detection
- For rawSections, preserve the full text of major document sections (executive summary, scope, timeline, etc.)
- Dates should be ISO 8601 format (YYYY-MM-DD)
- If a field can't be determined, omit it (don't guess)
- Return valid JSON only, no markdown wrapping`;

export interface ScopeProcessingResult {
  documentId: string;
  parsedData: ParsedScopeData;
  sowCreated: boolean;
  sowId?: string;
  lineItemsCreated: number;
}

export async function processScopeDocument(
  documentId: string
): Promise<ScopeProcessingResult> {
  const doc = await prisma.scopeDocument.findUnique({
    where: { id: documentId },
    include: {
      engagement: {
        select: {
          id: true,
          name: true,
          clientName: true,
          sow: { select: { id: true } },
        },
      },
    },
  });

  if (!doc) throw new Error(`ScopeDocument ${documentId} not found`);
  if (!doc.rawText) throw new Error(`ScopeDocument ${documentId} has no rawText`);

  await prisma.scopeDocument.update({
    where: { id: documentId },
    data: { status: "PROCESSING" },
  });

  log({
    level: "info",
    service: SERVICE,
    message: "Processing scope document with AI",
    engagementId: doc.engagementId,
    meta: { documentId, fileName: doc.fileName },
  });

  try {
    const contextBlock = `ENGAGEMENT CONTEXT:
- Engagement: ${doc.engagement.name}
- Client: ${doc.engagement.clientName}
- File: ${doc.fileName} (${doc.fileType})

DOCUMENT TEXT:
${doc.rawText.slice(0, 100_000)}`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: contextBlock }],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("No text response from AI");
    }

    let parsedData: ParsedScopeData;
    try {
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in AI response");
      parsedData = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      const detail = parseErr instanceof Error ? parseErr.message : "Parse failed";
      throw new Error(`Failed to parse AI response: ${detail}`);
    }

    if (!parsedData.workstreams) {
      parsedData.workstreams = [];
    }
    if (!parsedData.rawSections) {
      parsedData.rawSections = {};
    }

    await prisma.scopeDocument.update({
      where: { id: documentId },
      data: {
        parsedData: parsedData as unknown as Prisma.InputJsonValue,
        status: "PROCESSED",
      },
    });

    let sowCreated = false;
    let sowId: string | undefined;
    let lineItemsCreated = 0;

    if (!doc.engagement.sow && parsedData.workstreams.length > 0) {
      const sow = await prisma.sOW.create({
        data: {
          engagementId: doc.engagementId,
          title: parsedData.title || doc.fileName.replace(/\.[^.]+$/, ""),
          totalBudget: parsedData.totalBudget || null,
          totalHours: parsedData.totalHours || null,
          startDate: parsedData.startDate ? new Date(parsedData.startDate) : null,
          endDate: parsedData.endDate ? new Date(parsedData.endDate) : null,
          notes: buildSowNotes(parsedData),
          lineItems: {
            create: parsedData.workstreams.map((ws, idx) => ({
              workstream: ws.name,
              description: ws.description || null,
              allocatedHours: ws.allocatedHours || 0,
              rateTier: ws.rateTier || "TIER_1",
              hourlyRate: ws.hourlyRate || 100,
              displayOrder: idx,
            })),
          },
        },
      });

      sowCreated = true;
      sowId = sow.id;
      lineItemsCreated = parsedData.workstreams.length;

      log({
        level: "info",
        service: SERVICE,
        message: "Auto-created SOW from scope document",
        engagementId: doc.engagementId,
        meta: { sowId: sow.id, workstreams: lineItemsCreated },
      });
    }

    log({
      level: "info",
      service: SERVICE,
      message: "Scope document processed successfully",
      engagementId: doc.engagementId,
      meta: {
        documentId,
        workstreams: parsedData.workstreams.length,
        totalHours: parsedData.totalHours,
        totalBudget: parsedData.totalBudget,
        outOfScopeItems: parsedData.outOfScope?.length || 0,
        sowCreated,
      },
    });

    return { documentId, parsedData, sowCreated, sowId, lineItemsCreated };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await prisma.scopeDocument.update({
      where: { id: documentId },
      data: { status: "FAILED", errorMessage: message },
    });

    log({
      level: "error",
      service: SERVICE,
      message: "Scope document processing failed",
      engagementId: doc.engagementId,
      meta: { documentId, error: message },
    });

    throw error;
  }
}

function buildSowNotes(data: ParsedScopeData): string {
  const parts: string[] = [];

  if (data.paymentTerms) {
    parts.push(`Payment Terms: ${data.paymentTerms}`);
  }

  if (data.outOfScope?.length) {
    parts.push(`Out of Scope:\n${data.outOfScope.map((s) => `• ${s}`).join("\n")}`);
  }

  if (data.assumptions?.length) {
    parts.push(`Assumptions:\n${data.assumptions.map((s) => `• ${s}`).join("\n")}`);
  }

  return parts.join("\n\n") || "";
}
