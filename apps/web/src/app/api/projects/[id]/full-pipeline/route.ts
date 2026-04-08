import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";
import type { ScaffoldConfig, ProjectTemplateType } from "@rex/shared";
import { createRepo, pushScaffoldFiles } from "@/lib/github";
import { scaffoldProject } from "@/lib/project-scaffold";
import {
  createProject as createRailwayProject,
  createService,
  connectGitHubRepo,
  generateServiceDomain,
  setEnvVariables,
  redeployService,
} from "@/lib/railway";

/**
 * POST /api/projects/[id]/full-pipeline
 *
 * Runs the entire pipeline in sequence:
 *   1. Create GitHub repo
 *   2. Scaffold + push code
 *   3. Create Railway project
 *   4. Connect repo to Railway
 *   5. Set env vars
 *   6. Deploy
 *
 * Accepts optional { envVars } in the body.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const steps: { step: string; status: string; detail?: string }[] = [];

  function ok(step: string, detail?: string) {
    steps.push({ step, status: "ok", detail });
  }
  function fail(step: string, detail: string) {
    steps.push({ step, status: "failed", detail });
  }

  try {
    const project = await prisma.customProject.findUnique({
      where: { id: params.id },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const envVars: Record<string, string> = body.envVars || {};

    // ── Step 1: GitHub repo ──────────────────────────────────
    let repoFullName = project.githubRepo;

    if (!repoFullName) {
      const repo = await createRepo(project.name, {
        description: project.description || undefined,
        isPrivate: true,
      });
      repoFullName = repo.fullName;

      await prisma.customProject.update({
        where: { id: params.id },
        data: {
          githubRepo: repo.fullName,
          githubRepoUrl: repo.url,
          githubBranch: repo.defaultBranch || "main",
          status: "REPO_CREATED",
        },
      });

      ok("github_repo", repo.fullName);
    } else {
      ok("github_repo", `Already exists: ${repoFullName}`);
    }

    // ── Step 2: Scaffold + push ──────────────────────────────
    const scaffoldConfig = (project.scaffoldConfig as ScaffoldConfig) || {};
    const files = scaffoldProject(
      project.name,
      project.templateType as ProjectTemplateType,
      { ...scaffoldConfig, description: project.description || undefined }
    );

    try {
      const { commitSha } = await pushScaffoldFiles(
        repoFullName,
        files,
        "Initial scaffold from REX"
      );
      await prisma.customProject.update({
        where: { id: params.id },
        data: { status: "SCAFFOLDED" },
      });
      ok("scaffold_push", `${files.length} files, commit ${commitSha.slice(0, 7)}`);
    } catch (err: any) {
      if (err.status === 422) {
        ok("scaffold_push", "Repo already has commits — skipping scaffold");
      } else {
        throw err;
      }
    }

    // ── Step 3: Railway project + service ─────────────────────
    let railwayProjectId = project.railwayProjectId;
    let railwayServiceId = project.railwayServiceId;

    if (!railwayProjectId) {
      const rp = await createRailwayProject(project.name);
      railwayProjectId = rp.id;

      const svc = await createService(rp.id, project.name);
      railwayServiceId = svc.id;

      await connectGitHubRepo(svc.id, repoFullName, project.githubBranch);

      let railwayUrl: string | null = null;
      try {
        const domain = await generateServiceDomain(svc.id, rp.id);
        railwayUrl = `https://${domain.domain}`;
      } catch {
        // domain generation is best-effort
      }

      await prisma.customProject.update({
        where: { id: params.id },
        data: {
          railwayProjectId,
          railwayServiceId,
          railwayUrl,
          status: "RAILWAY_LINKED",
        },
      });

      ok("railway_link", `Project ${rp.id}, Service ${svc.id}`);
    } else {
      ok("railway_link", `Already linked: ${railwayProjectId}`);
    }

    // ── Step 4: Environment variables ─────────────────────────
    if (!envVars.PORT) {
      envVars.PORT = String(scaffoldConfig.port || 3000);
    }

    if (railwayServiceId && railwayProjectId) {
      await setEnvVariables(railwayServiceId, railwayProjectId, envVars);
      ok("env_vars", `${Object.keys(envVars).length} variables set`);
    }

    // ── Step 5: Deploy ────────────────────────────────────────
    if (railwayServiceId) {
      await prisma.customProject.update({
        where: { id: params.id },
        data: { status: "DEPLOYING" },
      });

      await redeployService(railwayServiceId);

      const updated = await prisma.customProject.update({
        where: { id: params.id },
        data: {
          status: "DEPLOYED",
          lastDeployedAt: new Date(),
          errorMessage: null,
        },
      });

      ok("deploy", updated.railwayUrl || "deployed");

      return NextResponse.json({ project: updated, steps });
    }

    return NextResponse.json({ steps }, { status: 500 });
  } catch (error: any) {
    console.error("Full pipeline failed:", error);
    fail("pipeline", error.message);

    await prisma.customProject.update({
      where: { id: params.id },
      data: { status: "DEPLOY_FAILED", errorMessage: error.message },
    }).catch(() => {});

    return NextResponse.json(
      { error: "Pipeline failed", detail: error.message, steps },
      { status: 500 }
    );
  }
}
