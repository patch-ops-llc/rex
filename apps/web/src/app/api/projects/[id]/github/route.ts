import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";
import type { ScaffoldConfig, ProjectTemplateType } from "@rex/shared";
import { createRepo, pushScaffoldFiles } from "@/lib/github";
import { scaffoldProject } from "@/lib/project-scaffold";

/**
 * POST /api/projects/[id]/github
 *
 * Creates a GitHub repo for the project, scaffolds template files,
 * and pushes them as the initial commit.
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

    if (project.githubRepo) {
      return NextResponse.json(
        { error: "GitHub repo already exists", repo: project.githubRepo },
        { status: 409 }
      );
    }

    // 1. Create the repo
    const repo = await createRepo(project.name, {
      description: project.description || undefined,
      isPrivate: true,
    });

    // 2. Scaffold project files
    const scaffoldConfig = (project.scaffoldConfig as ScaffoldConfig) || {};
    const files = scaffoldProject(
      project.name,
      project.templateType as ProjectTemplateType,
      { ...scaffoldConfig, description: project.description || undefined }
    );

    // 3. Push scaffold to repo
    const { commitSha } = await pushScaffoldFiles(
      repo.fullName,
      files,
      "Initial scaffold from REX"
    );

    // 4. Update project record
    const updated = await prisma.customProject.update({
      where: { id: params.id },
      data: {
        githubRepo: repo.fullName,
        githubRepoUrl: repo.url,
        githubBranch: repo.defaultBranch || "main",
        status: "SCAFFOLDED",
      },
    });

    return NextResponse.json({
      project: updated,
      repo: repo.fullName,
      repoUrl: repo.url,
      commitSha,
      filesCount: files.length,
    });
  } catch (error: any) {
    console.error("Failed to create GitHub repo:", error);

    await prisma.customProject.update({
      where: { id: params.id },
      data: { errorMessage: error.message },
    }).catch(() => {});

    return NextResponse.json(
      { error: "Failed to create GitHub repo", detail: error.message },
      { status: 500 }
    );
  }
}
