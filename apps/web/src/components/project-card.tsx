"use client";

import Link from "next/link";
import { formatDistanceToNow } from "@/lib/date";
import { ProjectDeployBadge } from "@/components/project-deploy-badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { GitBranch, Train } from "lucide-react";

interface ProjectCardProps {
  project: {
    id: string;
    name: string;
    description: string | null;
    templateType: string;
    status: string;
    githubRepo: string | null;
    railwayUrl: string | null;
    createdAt: string;
    lastDeployedAt: string | null;
  };
}

const templateLabels: Record<string, string> = {
  "express-integration": "Express Integration",
  "webhook-processor": "Webhook Processor",
  "bidirectional-sync": "Bidirectional Sync",
};

export function ProjectCard({ project }: ProjectCardProps) {
  return (
    <Link href={`/projects/${project.id}`}>
      <Card className="transition-colors hover:bg-accent/50 cursor-pointer">
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <div className="space-y-1">
            <CardTitle className="text-base">{project.name}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {project.description || templateLabels[project.templateType] || project.templateType}
            </p>
          </div>
          <ProjectDeployBadge status={project.status} />
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {project.githubRepo && (
              <span className="flex items-center gap-1">
                <GitBranch className="h-3 w-3" />
                {project.githubRepo}
              </span>
            )}
            {project.railwayUrl && (
              <span className="flex items-center gap-1">
                <Train className="h-3 w-3" />
                Live
              </span>
            )}
            <span>
              Created {formatDistanceToNow(new Date(project.createdAt))}
            </span>
            {project.lastDeployedAt && (
              <span>
                Deployed {formatDistanceToNow(new Date(project.lastDeployedAt))}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
