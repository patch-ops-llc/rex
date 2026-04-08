"use client";

import { useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  MessageSquareText,
  Lightbulb,
  ExternalLink,
  Copy,
  Check,
  Image as ImageIcon,
} from "lucide-react";

interface Annotation {
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
}

interface WalkthroughStep {
  id: string;
  stepOrder: number;
  category: string;
  title: string;
  narration: string;
  context: string | null;
  screenshotUrl: string | null;
  annotations: Annotation[] | null;
}

interface WalkthroughViewerProps {
  title: string;
  description?: string | null;
  clientName: string;
  engagementName: string;
  steps: WalkthroughStep[];
  shareToken?: string;
  branded?: boolean;
}

const CATEGORY_META: Record<string, { label: string; color: string; icon: string }> = {
  properties: { label: "Properties", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300", icon: "fields" },
  custom_objects: { label: "Custom Objects", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300", icon: "objects" },
  pipelines: { label: "Pipelines", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300", icon: "pipeline" },
  workflows: { label: "Workflows", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300", icon: "workflow" },
  lists: { label: "Lists", color: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300", icon: "list" },
  views: { label: "Views", color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300", icon: "view" },
  other: { label: "Other", color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300", icon: "other" },
};

function getCategoryMeta(category: string) {
  return CATEGORY_META[category] ?? CATEGORY_META.other;
}

function getUniqueCategories(steps: WalkthroughStep[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const step of steps) {
    if (!seen.has(step.category)) {
      seen.add(step.category);
      result.push(step.category);
    }
  }
  return result;
}

export function WalkthroughViewer({
  title,
  description,
  clientName,
  engagementName,
  steps,
  shareToken,
  branded = false,
}: WalkthroughViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showOutline, setShowOutline] = useState(false);
  const [copied, setCopied] = useState(false);

  const currentStep = steps[currentIndex];
  const categories = getUniqueCategories(steps);
  const totalSteps = steps.length;
  const progress = totalSteps > 0 ? ((currentIndex + 1) / totalSteps) * 100 : 0;

  const goToStep = useCallback(
    (index: number) => {
      if (index >= 0 && index < totalSteps) {
        setCurrentIndex(index);
        setShowOutline(false);
      }
    },
    [totalSteps]
  );

  const goNext = useCallback(() => goToStep(currentIndex + 1), [currentIndex, goToStep]);
  const goPrev = useCallback(() => goToStep(currentIndex - 1), [currentIndex, goToStep]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "Escape") {
        setShowOutline(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrev]);

  const copyShareLink = useCallback(async () => {
    if (!shareToken) return;
    const url = `${window.location.origin}/walkthrough/${shareToken}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [shareToken]);

  if (steps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <LayoutGrid className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium">No Walkthrough Steps</h3>
        <p className="text-sm text-muted-foreground mt-1">
          This walkthrough doesn&apos;t have any steps yet.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-[600px]">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
            {description && (
              <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {clientName} · {engagementName}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {shareToken && (
              <button
                onClick={copyShareLink}
                className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-green-600" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Share Link
                  </>
                )}
              </button>
            )}
            <button
              onClick={() => setShowOutline(!showOutline)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                showOutline ? "bg-accent" : "hover:bg-accent"
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Outline
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground font-medium tabular-nums">
            {currentIndex + 1} / {totalSteps}
          </span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Outline sidebar */}
        {showOutline && (
          <div className="w-72 border-r overflow-y-auto bg-muted/30 p-4 space-y-4 shrink-0">
            {categories.map((cat) => {
              const meta = getCategoryMeta(cat);
              const categorySteps = steps.filter((s) => s.category === cat);
              return (
                <div key={cat}>
                  <div className={cn("inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium mb-2", meta.color)}>
                    {meta.label}
                  </div>
                  <div className="space-y-0.5">
                    {categorySteps.map((step) => (
                      <button
                        key={step.id}
                        onClick={() => goToStep(step.stepOrder)}
                        className={cn(
                          "w-full text-left rounded px-2.5 py-1.5 text-sm transition-colors",
                          currentIndex === step.stepOrder
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        )}
                      >
                        {step.title}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 overflow-y-auto">
          {currentStep && (
            <div className="max-w-3xl mx-auto p-6 space-y-6">
              {/* Category badge + step title */}
              <div>
                <div className={cn("inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium mb-2", getCategoryMeta(currentStep.category).color)}>
                  {getCategoryMeta(currentStep.category).label}
                </div>
                <h3 className="text-2xl font-semibold tracking-tight">
                  {currentStep.title}
                </h3>
              </div>

              {/* Screenshot with annotation overlays */}
              {currentStep.screenshotUrl ? (
                <div className="rounded-lg border overflow-hidden bg-muted relative">
                  <img
                    src={currentStep.screenshotUrl}
                    alt={currentStep.title}
                    className="w-full"
                  />
                  {currentStep.annotations && currentStep.annotations.length > 0 && (
                    <div className="absolute inset-0">
                      {currentStep.annotations.map((ann, i) => (
                        <div
                          key={i}
                          className="absolute border-2 border-primary rounded-sm bg-primary/5 group cursor-pointer transition-colors hover:bg-primary/10"
                          style={{
                            left: `${ann.x}%`,
                            top: `${ann.y}%`,
                            width: `${ann.width}%`,
                            height: `${ann.height}%`,
                          }}
                        >
                          {ann.label && (
                            <div className="absolute -top-7 left-0 hidden group-hover:block">
                              <span className="rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground whitespace-nowrap shadow-md">
                                {ann.label}
                              </span>
                            </div>
                          )}
                          <div className="absolute -top-2.5 -left-2.5 h-5 w-5 rounded-full bg-primary flex items-center justify-center text-[10px] font-bold text-primary-foreground shadow-sm">
                            {i + 1}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed bg-muted/50 flex items-center justify-center py-16">
                  <div className="text-center text-muted-foreground">
                    <ImageIcon className="h-10 w-10 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Screenshot will appear here when capture is enabled</p>
                  </div>
                </div>
              )}

              {/* Narration */}
              <div className="rounded-lg border bg-card p-5 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <MessageSquareText className="h-4 w-4 text-primary" />
                  What you&apos;re looking at
                </div>
                <p className="text-sm leading-relaxed text-foreground/90">
                  {currentStep.narration}
                </p>
              </div>

              {/* Context (why it was built) */}
              {currentStep.context && (
                <div className="rounded-lg border border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-900/10 p-5 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
                    <Lightbulb className="h-4 w-4" />
                    Why this was built
                  </div>
                  <p className="text-sm leading-relaxed text-amber-900/80 dark:text-amber-200/80">
                    {currentStep.context}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Navigation footer */}
      <div className="border-t px-6 py-3 flex items-center justify-between bg-background">
        <button
          onClick={goPrev}
          disabled={currentIndex === 0}
          className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-40 disabled:pointer-events-none"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </button>

        {/* Step dots for small walkthroughs, or category indicators */}
        <div className="flex items-center gap-1">
          {totalSteps <= 20 ? (
            steps.map((step, i) => (
              <button
                key={step.id}
                onClick={() => goToStep(i)}
                className={cn(
                  "h-2 w-2 rounded-full transition-all",
                  i === currentIndex
                    ? "bg-primary scale-125"
                    : i < currentIndex
                      ? "bg-primary/40"
                      : "bg-muted-foreground/20"
                )}
              />
            ))
          ) : (
            <span className="text-xs text-muted-foreground">
              Step {currentIndex + 1} of {totalSteps}
            </span>
          )}
        </div>

        <button
          onClick={goNext}
          disabled={currentIndex === totalSteps - 1}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium transition-colors hover:bg-primary/90 disabled:opacity-40 disabled:pointer-events-none"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Branding footer for shared view */}
      {branded && (
        <div className="border-t px-6 py-2 flex items-center justify-center bg-muted/30">
          <a
            href="https://patchops.io"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Built with Rex by PatchOps
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
    </div>
  );
}
