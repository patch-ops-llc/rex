import { prisma } from "@rex/shared";
import { notFound } from "next/navigation";
import { ProjectDetailClient } from "@/components/project-detail";

export default async function ProjectDetailPage({
  params,
}: {
  params: { id: string };
}) {
  let project;
  try {
    project = await prisma.customProject.findUnique({
      where: { id: params.id },
    });
  } catch {
    // DB not connected
  }

  if (!project) return notFound();

  return (
    <ProjectDetailClient
      project={{
        ...project,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
        lastDeployedAt: project.lastDeployedAt?.toISOString() ?? null,
        scaffoldConfig: project.scaffoldConfig as Record<string, unknown> | null,
        envVars: project.envVars as Record<string, string> | null,
      }}
    />
  );
}
