import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";
import {
  redeployService,
  setEnvVariables,
  getLatestDeployment,
} from "@/lib/railway";

/**
 * POST /api/projects/[id]/deploy
 *
 * Pushes environment variables and triggers a redeploy on Railway.
 * Optionally accepts { envVars } in the body to set before deploying.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const project = await prisma.customProject.findUnique({
      where: { id: params.id },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (!project.railwayProjectId || !project.railwayServiceId) {
      return NextResponse.json(
        { error: "Railway project must be linked first" },
        { status: 400 }
      );
    }

    // Merge any env vars from request body with stored config
    const body = await request.json().catch(() => ({}));
    const envVars: Record<string, string> = body.envVars || {};

    // Always set PORT if not provided
    if (!envVars.PORT) {
      const scaffoldConfig = project.scaffoldConfig as Record<string, unknown> | null;
      envVars.PORT = String(scaffoldConfig?.port || 3000);
    }

    // Push env vars if we have any
    if (Object.keys(envVars).length > 0) {
      await setEnvVariables(
        project.railwayServiceId,
        project.railwayProjectId,
        envVars
      );

      // Persist non-secret vars for reference
      const safeVars = { ...envVars };
      for (const key of Object.keys(safeVars)) {
        if (/token|secret|key|password/i.test(key)) {
          safeVars[key] = "***";
        }
      }
      await prisma.customProject.update({
        where: { id: params.id },
        data: { envVars: safeVars },
      });
    }

    // Trigger redeploy
    await prisma.customProject.update({
      where: { id: params.id },
      data: { status: "DEPLOYING", errorMessage: null },
    });

    await redeployService(project.railwayServiceId);

    await prisma.customProject.update({
      where: { id: params.id },
      data: {
        status: "DEPLOYED",
        lastDeployedAt: new Date(),
      },
    });

    return NextResponse.json({
      deployed: true,
      railwayUrl: project.railwayUrl,
    });
  } catch (error: any) {
    console.error("Deployment failed:", error);

    await prisma.customProject.update({
      where: { id: params.id },
      data: { status: "DEPLOY_FAILED", errorMessage: error.message },
    }).catch(() => {});

    return NextResponse.json(
      { error: "Deployment failed", detail: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/projects/[id]/deploy
 *
 * Returns the latest deployment status from Railway.
 */
export async function GET(
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

    if (!project.railwayServiceId) {
      return NextResponse.json(
        { error: "No Railway service linked" },
        { status: 400 }
      );
    }

    const deployment = await getLatestDeployment(project.railwayServiceId);

    return NextResponse.json({
      projectStatus: project.status,
      lastDeployedAt: project.lastDeployedAt,
      railwayUrl: project.railwayUrl,
      latestDeployment: deployment,
    });
  } catch (error: any) {
    console.error("Failed to fetch deployment status:", error);
    return NextResponse.json(
      { error: "Failed to fetch deployment status", detail: error.message },
      { status: 500 }
    );
  }
}
