"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProjectDeployBadge } from "@/components/project-deploy-badge";
import {
  GitBranch,
  Train,
  Rocket,
  ExternalLink,
  CheckCircle2,
  Circle,
  Loader2,
  AlertCircle,
  Play,
} from "lucide-react";
import { formatDistanceToNow } from "@/lib/date";

interface ProjectData {
  id: string;
  name: string;
  description: string | null;
  templateType: string;
  status: string;
  githubRepo: string | null;
  githubRepoUrl: string | null;
  githubBranch: string;
  railwayProjectId: string | null;
  railwayServiceId: string | null;
  railwayUrl: string | null;
  engagementId: string | null;
  errorMessage: string | null;
  scaffoldConfig: Record<string, unknown> | null;
  envVars: Record<string, string> | null;
  createdAt: string;
  updatedAt: string;
  lastDeployedAt: string | null;
}

const templateLabels: Record<string, string> = {
  "express-integration": "Express Integration",
  "webhook-processor": "Webhook Processor",
  "bidirectional-sync": "Bidirectional Sync",
};

type PipelineStep = "github" | "railway" | "deploy";

function getCompletedSteps(status: string): PipelineStep[] {
  switch (status) {
    case "DEPLOYED":
      return ["github", "railway", "deploy"];
    case "DEPLOYING":
      return ["github", "railway"];
    case "RAILWAY_LINKED":
      return ["github", "railway"];
    case "SCAFFOLDED":
    case "REPO_CREATED":
      return ["github"];
    default:
      return [];
  }
}

function getActiveStep(status: string): PipelineStep | null {
  switch (status) {
    case "CREATED":
      return "github";
    case "REPO_CREATED":
    case "SCAFFOLDED":
      return "railway";
    case "RAILWAY_LINKED":
      return "deploy";
    case "DEPLOYING":
      return "deploy";
    case "DEPLOY_FAILED":
      return "deploy";
    default:
      return null;
  }
}

export function ProjectDetailClient({ project: initial }: { project: ProjectData }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initial.errorMessage);
  const [pipelineRunning, setPipelineRunning] = useState(false);

  const status = initial.status;
  const completed = getCompletedSteps(status);
  const activeStep = getActiveStep(status);

  async function runStep(step: PipelineStep) {
    setLoading(step);
    setError(null);

    const urlMap: Record<PipelineStep, string> = {
      github: `/api/projects/${initial.id}/github`,
      railway: `/api/projects/${initial.id}/railway`,
      deploy: `/api/projects/${initial.id}/deploy`,
    };

    try {
      const res = await fetch(urlMap[step], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || data.error || `Step ${step} failed`);
      }

      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(null);
    }
  }

  async function runFullPipeline() {
    setPipelineRunning(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${initial.id}/full-pipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || data.error || "Pipeline failed");
      }

      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPipelineRunning(false);
    }
  }

  const steps: { key: PipelineStep; label: string; description: string }[] = [
    {
      key: "github",
      label: "Create GitHub Repo",
      description: "Scaffold project files and push to a new private repo",
    },
    {
      key: "railway",
      label: "Link to Railway",
      description: "Create Railway project, connect repo, generate domain",
    },
    {
      key: "deploy",
      label: "Deploy",
      description: "Push env vars and trigger the first deployment",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{initial.name}</h1>
            <ProjectDeployBadge status={status} />
          </div>
          <p className="text-muted-foreground">
            {initial.description || templateLabels[initial.templateType] || initial.templateType}
          </p>
        </div>
        {status === "CREATED" && (
          <Button onClick={runFullPipeline} disabled={pipelineRunning}>
            {pipelineRunning ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Running Pipeline…
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Run Full Pipeline
              </>
            )}
          </Button>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-destructive">Error</p>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Pipeline Steps */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Deployment Pipeline</CardTitle>
          <CardDescription>
            Step through each phase or run the full pipeline at once.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {steps.map((step, i) => {
              const isDone = completed.includes(step.key);
              const isActive = activeStep === step.key;
              const isLoading = loading === step.key || (pipelineRunning && isActive);
              const isFailed = status === "DEPLOY_FAILED" && step.key === "deploy";

              return (
                <div key={step.key}>
                  <div className="flex items-center gap-4">
                    {/* Step indicator */}
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center">
                      {isLoading ? (
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      ) : isDone ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      ) : isFailed ? (
                        <AlertCircle className="h-5 w-5 text-destructive" />
                      ) : (
                        <Circle className="h-5 w-5 text-muted-foreground/40" />
                      )}
                    </div>

                    {/* Step content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{step.label}</p>
                      <p className="text-xs text-muted-foreground">{step.description}</p>
                    </div>

                    {/* Action */}
                    {isActive && !pipelineRunning && (
                      <Button
                        size="sm"
                        variant={isFailed ? "destructive" : "default"}
                        onClick={() => runStep(step.key)}
                        disabled={!!loading}
                      >
                        {isLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : isFailed ? (
                          "Retry"
                        ) : (
                          "Run"
                        )}
                      </Button>
                    )}
                    {isDone && (
                      <Badge variant="success" className="text-xs">
                        Done
                      </Badge>
                    )}
                  </div>

                  {/* Connector line */}
                  {i < steps.length - 1 && (
                    <div className="ml-[15px] mt-1 mb-1 h-4 w-px bg-border" />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Project info cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* GitHub */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <GitBranch className="h-4 w-4" />
              GitHub
            </CardTitle>
          </CardHeader>
          <CardContent>
            {initial.githubRepo ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-mono">{initial.githubRepo}</span>
                  <a
                    href={initial.githubRepoUrl || `https://github.com/${initial.githubRepo}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
                <p className="text-xs text-muted-foreground">
                  Branch: {initial.githubBranch}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Not connected yet</p>
            )}
          </CardContent>
        </Card>

        {/* Railway */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Train className="h-4 w-4" />
              Railway
            </CardTitle>
          </CardHeader>
          <CardContent>
            {initial.railwayProjectId ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-mono text-muted-foreground">
                    {initial.railwayProjectId.slice(0, 16)}…
                  </span>
                  <a
                    href={`https://railway.com/project/${initial.railwayProjectId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
                {initial.railwayUrl && (
                  <div className="flex items-center gap-2">
                    <Rocket className="h-3 w-3 text-green-600" />
                    <a
                      href={initial.railwayUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline truncate"
                    >
                      {initial.railwayUrl.replace("https://", "")}
                    </a>
                  </div>
                )}
                {initial.lastDeployedAt && (
                  <p className="text-xs text-muted-foreground">
                    Last deployed {formatDistanceToNow(new Date(initial.lastDeployedAt))}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Not connected yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Details */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Template</dt>
              <dd className="font-medium">
                {templateLabels[initial.templateType] || initial.templateType}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Created</dt>
              <dd className="font-medium">
                {new Date(initial.createdAt).toLocaleDateString()}
              </dd>
            </div>
            {initial.engagementId && (
              <div>
                <dt className="text-muted-foreground">Engagement</dt>
                <dd className="font-medium font-mono text-xs">
                  {initial.engagementId}
                </dd>
              </div>
            )}
            {initial.envVars && Object.keys(initial.envVars).length > 0 && (
              <div className="col-span-2">
                <dt className="text-muted-foreground mb-1">Environment Variables</dt>
                <dd>
                  <div className="rounded-md bg-muted p-3 font-mono text-xs space-y-1">
                    {Object.entries(initial.envVars).map(([key, value]) => (
                      <div key={key}>
                        <span className="text-muted-foreground">{key}</span>
                        <span className="text-muted-foreground">=</span>
                        <span>{value}</span>
                      </div>
                    ))}
                  </div>
                </dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* Re-deploy for already-deployed projects */}
      {status === "DEPLOYED" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => runStep("deploy")}
              disabled={!!loading}
            >
              {loading === "deploy" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Rocket className="mr-2 h-4 w-4" />
              )}
              Redeploy
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
