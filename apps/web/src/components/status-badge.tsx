"use client";

import { Badge } from "@/components/ui/badge";
import type { EngagementStatus } from "@rex/shared";

const statusConfig: Record<
  string,
  { label: string; variant: "default" | "secondary" | "success" | "warning" | "info" | "destructive" | "outline" }
> = {
  CREATED: { label: "Created", variant: "secondary" },
  SCHEDULED: { label: "Scheduled", variant: "info" },
  DISCOVERY: { label: "Discovery", variant: "info" },
  PLAN_GENERATION: { label: "Generating Plan", variant: "warning" },
  PLAN_REVIEW: { label: "Plan Review", variant: "warning" },
  IMPLEMENTING: { label: "Implementing", variant: "default" },
  QA: { label: "QA", variant: "warning" },
  ENABLEMENT: { label: "Enablement", variant: "info" },
  ACTIVE_SUPPORT: { label: "Active Support", variant: "success" },
  COMPLETE: { label: "Complete", variant: "success" },
  // Walkthrough statuses
  GENERATING: { label: "Generating", variant: "warning" },
  CAPTURING: { label: "Capturing", variant: "info" },
  NARRATING: { label: "Narrating", variant: "info" },
  READY: { label: "Ready", variant: "success" },
  FAILED: { label: "Failed", variant: "destructive" },
};

export function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] ?? {
    label: status,
    variant: "outline" as const,
  };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
