import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";

export async function GET() {
  try {
    const projects = await prisma.customProject.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(projects);
  } catch (error) {
    console.error("Failed to fetch projects:", error);
    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, engagementId, templateType, scaffoldConfig } = body;

    if (!name) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    const project = await prisma.customProject.create({
      data: {
        name,
        description: description || null,
        engagementId: engagementId || null,
        templateType: templateType || "express-integration",
        scaffoldConfig: scaffoldConfig || null,
      },
    });

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error("Failed to create project:", error);
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 }
    );
  }
}
