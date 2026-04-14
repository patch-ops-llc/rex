import type { BuildPlanData } from "@rex/shared";

export interface ExecutionContext {
  engagementId: string;
  buildPlanId: string;
  portalId: string;
  accessToken: string;
  hubspotPortalId: string; // numeric HubSpot portal ID
  dryRun?: boolean;
}

export interface StepResult {
  success: boolean;
  hubspotResponse?: Record<string, unknown>;
  rollbackData?: Record<string, unknown>;
  errorMessage?: string;
  skipped?: boolean;
  skipReason?: string;
}

export interface ExecutionStep {
  stepType: string;
  stepName: string;
  stepOrder: number;
  config: Record<string, unknown>;
  execute: (ctx: ExecutionContext) => Promise<StepResult>;
}

export interface ExecutionSummary {
  engagementId: string;
  buildPlanId: string;
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  skippedSteps: number;
  humanRequiredItems: BuildPlanData["humanRequiredItems"];
  errors: Array<{ stepName: string; error: string }>;
  implementationIds: string[];
}

export type StepExecutor = (
  config: Record<string, unknown>,
  ctx: ExecutionContext,
) => Promise<StepResult>;
