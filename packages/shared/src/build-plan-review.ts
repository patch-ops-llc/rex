import type { BuildPlanData } from "./types";

export const REVIEWABLE_PLAN_SECTIONS = [
  "propertyGroups",
  "properties",
  "customObjects",
  "associations",
  "pipelines",
  "workflows",
  "lists",
  "views",
  "humanRequiredItems",
  "qaChecklist",
] as const;

export type ReviewablePlanSection = (typeof REVIEWABLE_PLAN_SECTIONS)[number];
export type PlanItemReviewStatus = "APPROVED" | "REJECTED";

type ReviewableItem = {
  reviewStatus?: PlanItemReviewStatus;
};

export function isPlanItemRejected(item: unknown): boolean {
  if (!item || typeof item !== "object") return false;
  return (item as ReviewableItem).reviewStatus === "REJECTED";
}

export function filterRejectedPlanItems(planData: BuildPlanData): BuildPlanData {
  const cloneSection = <T extends object>(items: T[] | undefined): T[] =>
    (items ?? []).filter((item) => !isPlanItemRejected(item)).map((item) => ({ ...item }));

  return {
    ...planData,
    propertyGroups: cloneSection(planData.propertyGroups),
    properties: cloneSection(planData.properties),
    customObjects: cloneSection(planData.customObjects),
    associations: cloneSection(planData.associations),
    pipelines: cloneSection(planData.pipelines),
    workflows: cloneSection(planData.workflows),
    lists: cloneSection(planData.lists),
    views: cloneSection(planData.views),
    humanRequiredItems: cloneSection(planData.humanRequiredItems),
    qaChecklist: cloneSection(planData.qaChecklist),
  };
}
