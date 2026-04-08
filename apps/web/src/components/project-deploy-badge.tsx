"use client";

import { Badge } from "@/components/ui/badge";

const statusConfig: Record<
  string,
  { label: string; variant: "default" | "secondary" | "success" | "warning" | "info" | "destructive" | "outline" }
> = {
  CREATED: { label: "Created", variant: "secondary" },
  REPO_CREATED: { label: "Repo Created", variant: "info" },
  SCAFFOLDED: { label: "Scaffolded", variant: "info" },
  RAILWAY_LINKED: { label: "Railway Linked", variant: "warning" },
  DEPLOYING: { label: "Deploying…", variant: "warning" },
  DEPLOYED: { label: "Deployed", variant: "success" },
  DEPLOY_FAILED: { label: "Deploy Failed", variant: "destructive" },
};

export function ProjectDeployBadge({ status }: { status: string }) {
  const config = statusConfig[status] ?? {
    label: status,
    variant: "outline" as const,
  };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
