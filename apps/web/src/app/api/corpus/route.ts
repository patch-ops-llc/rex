import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const industry = searchParams.get("industry");
    const category = searchParams.get("category");
    const complexity = searchParams.get("complexity");
    const tag = searchParams.get("tag");

    const where: any = {};
    if (industry) where.industry = industry;
    if (category) where.category = category;
    if (complexity) where.complexity = complexity;
    if (tag) where.tags = { has: tag };

    const entries = await prisma.corpusEntry.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(entries);
  } catch (error) {
    console.error("Failed to fetch corpus entries:", error);
    return NextResponse.json(
      { error: "Failed to fetch corpus entries" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (Array.isArray(body)) {
      const validated = body.map((entry: any) => {
        if (!entry.name || !entry.transcript) {
          throw new Error("Each entry requires name and transcript");
        }
        return {
          name: entry.name,
          transcript:
            typeof entry.transcript === "string"
              ? { raw: entry.transcript }
              : entry.transcript,
          annotations: entry.annotations || null,
          tags: entry.tags || [],
          industry: entry.industry || null,
          complexity: entry.complexity || null,
          outcome: entry.outcome || null,
          category: entry.category || null,
          source: entry.source || null,
        };
      });

      const entries = await prisma.corpusEntry.createMany({
        data: validated,
      });

      return NextResponse.json(
        { created: entries.count },
        { status: 201 }
      );
    }

    const { name, transcript, annotations, tags, industry, complexity, outcome, category, source } = body;

    if (!name || !transcript) {
      return NextResponse.json(
        { error: "name and transcript are required" },
        { status: 400 }
      );
    }

    const entry = await prisma.corpusEntry.create({
      data: {
        name,
        transcript:
          typeof transcript === "string"
            ? { raw: transcript }
            : transcript,
        annotations: annotations || null,
        tags: tags || [],
        industry: industry || null,
        complexity: complexity || null,
        outcome: outcome || null,
        category: category || null,
        source: source || null,
      },
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (error: any) {
    console.error("Failed to create corpus entry:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create corpus entry" },
      { status: 500 }
    );
  }
}
