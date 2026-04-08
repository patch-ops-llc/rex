import { prisma } from "@rex/shared";
import { CreateProjectDialog } from "@/components/create-project-dialog";
import { ProjectCard } from "@/components/project-card";

export default async function ProjectsPage() {
  let projects: any[] = [];
  try {
    projects = await prisma.customProject.findMany({
      orderBy: { createdAt: "desc" },
    });
  } catch {
    // DB not connected yet
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground">
            Custom integration projects — GitHub repos scaffolded and deployed to Railway.
          </p>
        </div>
        <CreateProjectDialog />
      </div>

      {projects.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <h3 className="text-lg font-semibold">No projects yet</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Create a project to scaffold a repo and deploy it to Railway.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={{
                ...project,
                createdAt: project.createdAt.toISOString(),
                lastDeployedAt: project.lastDeployedAt?.toISOString() ?? null,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
