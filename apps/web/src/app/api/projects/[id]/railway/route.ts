import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";
import {
  createProject,
  createService,
  connectGitHubRepo,
  generateServiceDomain,
} from "@/lib/railway";

/**
 * POST /api/projects/[id]/railway
 *
 * Creates a Railway project, creates a service inside it,
 * connects the GitHub repo, and generates a public domain.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const project = await prisma.customProject.findUnique({
      where: { id: params.id },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (!project.githubRepo) {
      return NextResponse.json(
        { error: "GitHub repo must be created first" },
        { status: 400 }
      );
    }

    if (project.railwayProjectId) {
      return NextResponse.json(
        {
          error: "Railway project already linked",
          railwayProjectId: project.railwayProjectId,
        },
        { status: 409 }
      );
    }

    // 1. Create Railway project
    const railwayProject = await createProject(project.name);

    // 2. Create a service inside the project
    const service = await createService(railwayProject.id, project.name);

    // 3. Connect GitHub repo to the service
    await connectGitHubRepo(service.id, project.githubRepo, project.githubBranch);

    // 4. Generate a public domain
    let railwayUrl: string | null = null;
    try {
      const domain = await generateServiceDomain(service.id, railwayProject.id);
      railwayUrl = `https://${domain.domain}`;
    } catch (err) {
      console.warn("Could not generate Railway domain:", err);
    }

    // 5. Update project record
    const updated = await prisma.customProject.update({
      where: { id: params.id },
      data: {
        railwayProjectId: railwayProject.id,
        railwayServiceId: service.id,
        railwayUrl,
        status: "RAILWAY_LINKED",
        errorMessage: null,
      },
    });

    return NextResponse.json({
      project: updated,
      railwayProjectId: railwayProject.id,
      railwayServiceId: service.id,
      railwayUrl,
    });
  } catch (error: any) {
    console.error("Failed to create Railway project:", error);

    await prisma.customProject.update({
      where: { id: params.id },
      data: { errorMessage: error.message },
    }).catch(() => {});

    return NextResponse.json(
      { error: "Failed to create Railway project", detail: error.message },
      { status: 500 }
    );
  }
}
