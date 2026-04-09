import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string; callId: string } }
) {
  try {
    const call = await prisma.discoveryCall.findUnique({
      where: { id: params.callId },
      select: { engagementId: true, title: true },
    });

    if (!call || call.engagementId !== params.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const engagement = await prisma.engagement.findUnique({
      where: { id: params.id },
      include: {
        sow: { include: { lineItems: { orderBy: { displayOrder: "asc" } } } },
        requirementItems: {
          where: { status: "PENDING" },
          take: 30,
        },
        scopeDocuments: {
          where: { status: "PROCESSED" },
          select: { parsedData: true, fileName: true },
          take: 5,
        },
      },
    });

    if (!engagement) {
      return NextResponse.json(
        { error: "Engagement not found" },
        { status: 404 }
      );
    }

    let contextBlock = `ENGAGEMENT CONTEXT:
- Client: ${engagement.clientName}
- Engagement: ${engagement.name}
- Industry: ${engagement.industry || "Not specified"}
- HubSpot Tier: ${engagement.hubspotTier || "Not specified"}
- Call Title: ${call.title || "Discovery Call"}`;

    if (engagement.sow) {
      contextBlock += `\n\nSOW WORKSTREAMS:`;
      for (const li of engagement.sow.lineItems) {
        contextBlock += `\n- ${li.workstream}: ${li.allocatedHours}h at $${li.hourlyRate}/h${li.description ? ` — ${li.description}` : ""}`;
      }
    }

    if (engagement.requirementItems.length > 0) {
      contextBlock += `\n\nOPEN REQUIREMENTS (unanswered):`;
      for (const r of engagement.requirementItems) {
        contextBlock += `\n- [${r.category}] ${r.question}`;
      }
    }

    if (engagement.scopeDocuments.length > 0) {
      contextBlock += `\n\nSCOPE DOCUMENTS:`;
      for (const doc of engagement.scopeDocuments) {
        const parsed = doc.parsedData as any;
        if (parsed?.workstreams) {
          contextBlock += `\n- ${doc.fileName}: ${parsed.workstreams.length} workstreams`;
          for (const ws of parsed.workstreams) {
            contextBlock += `\n  • ${ws.name}${ws.description ? `: ${ws.description}` : ""}`;
          }
        }
      }
    }

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: `Your name is Rex. You're part of the PatchOps team, specializing in CRM implementations and system integrations. You're generating a structured discovery call agenda.

Generate a focused, actionable agenda based on the engagement context. Each item should represent a specific topic to discuss and resolve during the call.

Rules:
- 5-12 agenda items depending on complexity
- Order them logically (introductions → current state → requirements → specifics → timeline → next steps)
- Each item needs a clear title and a brief description of what to cover
- Focus on uncovering actionable information, not generic filler
- If there's a SOW, align items to workstreams
- If there are open requirements, prioritize resolving those
- Return valid JSON only

Output format:
{
  "items": [
    {
      "title": "Current CRM Setup & Pain Points",
      "description": "Understand the client's existing CRM configuration, what's working, and where the biggest friction points are"
    }
  ]
}`,
      messages: [
        {
          role: "user",
          content: `Generate a discovery call agenda for this engagement.\n\n${contextBlock}`,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      return NextResponse.json(
        { error: "No text response from AI" },
        { status: 500 }
      );
    }

    let parsed: { items: Array<{ title: string; description?: string }> };
    try {
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found");
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      console.error("Failed to parse agenda response:", content.text);
      return NextResponse.json(
        { error: "Failed to parse AI response" },
        { status: 500 }
      );
    }

    if (!parsed.items?.length) {
      return NextResponse.json(
        { error: "AI returned no agenda items" },
        { status: 500 }
      );
    }

    const maxOrder = await prisma.callAgendaItem.aggregate({
      where: { discoveryCallId: params.callId },
      _max: { displayOrder: true },
    });
    const startOrder = (maxOrder._max.displayOrder ?? -1) + 1;

    const created = await prisma.$transaction(
      parsed.items.map((item, idx) =>
        prisma.callAgendaItem.create({
          data: {
            discoveryCallId: params.callId,
            title: item.title,
            description: item.description || null,
            displayOrder: startOrder + idx,
          },
        })
      )
    );

    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    console.error("Failed to generate agenda:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate agenda" },
      { status: 500 }
    );
  }
}
