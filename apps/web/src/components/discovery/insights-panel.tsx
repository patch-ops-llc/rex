"use client";

import { useState } from "react";
import {
  CheckCircle2,
  ListTodo,
  Lightbulb,
  AlertTriangle,
  Monitor,
  CalendarClock,
  HelpCircle,
  UserCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Insight {
  id: string;
  type: string;
  content: string;
  speaker: string | null;
  timestamp: number | null;
  confidence: number | null;
  metadata: Record<string, unknown> | null;
}

interface InsightsPanelProps {
  insights: Insight[];
}

const INSIGHT_CONFIG: Record<
  string,
  { label: string; icon: typeof CheckCircle2; color: string; bgColor: string }
> = {
  REQUIREMENT: {
    label: "Requirements",
    icon: Lightbulb,
    color: "text-blue-400",
    bgColor: "bg-blue-400/10",
  },
  ACTION_ITEM: {
    label: "Action Items",
    icon: ListTodo,
    color: "text-amber-400",
    bgColor: "bg-amber-400/10",
  },
  DECISION: {
    label: "Decisions",
    icon: CheckCircle2,
    color: "text-emerald-400",
    bgColor: "bg-emerald-400/10",
  },
  SCOPE_CONCERN: {
    label: "Scope Concerns",
    icon: AlertTriangle,
    color: "text-red-400",
    bgColor: "bg-red-400/10",
  },
  SYSTEM_MENTION: {
    label: "Systems",
    icon: Monitor,
    color: "text-purple-400",
    bgColor: "bg-purple-400/10",
  },
  TIMELINE: {
    label: "Timeline",
    icon: CalendarClock,
    color: "text-cyan-400",
    bgColor: "bg-cyan-400/10",
  },
  OPEN_QUESTION: {
    label: "Open Questions",
    icon: HelpCircle,
    color: "text-orange-400",
    bgColor: "bg-orange-400/10",
  },
  STAKEHOLDER_NOTE: {
    label: "Stakeholders",
    icon: UserCircle,
    color: "text-rose-400",
    bgColor: "bg-rose-400/10",
  },
};

const TYPE_ORDER = [
  "REQUIREMENT",
  "ACTION_ITEM",
  "DECISION",
  "SCOPE_CONCERN",
  "SYSTEM_MENTION",
  "TIMELINE",
  "OPEN_QUESTION",
  "STAKEHOLDER_NOTE",
];

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function InsightsPanel({ insights }: InsightsPanelProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const grouped: Record<string, Insight[]> = {};
  for (const insight of insights) {
    if (!grouped[insight.type]) grouped[insight.type] = [];
    grouped[insight.type].push(insight);
  }

  const toggleSection = (type: string) => {
    setCollapsed((prev) => ({ ...prev, [type]: !prev[type] }));
  };

  const typesWithInsights = TYPE_ORDER.filter(
    (t) => grouped[t] && grouped[t].length > 0
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Insights
        </h2>
        <span className="text-xs text-zinc-600">
          {insights.length} extracted
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {insights.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6">
            <p className="text-center text-sm text-zinc-600">
              Rex is listening. Insights will appear here as the conversation
              unfolds.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/50">
            {typesWithInsights.map((type) => {
              const config = INSIGHT_CONFIG[type];
              const items = grouped[type];
              const isCollapsed = collapsed[type];
              const Icon = config.icon;

              return (
                <div key={type}>
                  <button
                    onClick={() => toggleSection(type)}
                    className="flex w-full items-center justify-between px-4 py-2.5 transition hover:bg-zinc-900/50"
                  >
                    <div className="flex items-center gap-2">
                      <Icon className={cn("h-3.5 w-3.5", config.color)} />
                      <span className="text-xs font-semibold text-zinc-300">
                        {config.label}
                      </span>
                      <span
                        className={cn(
                          "flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold",
                          config.bgColor,
                          config.color
                        )}
                      >
                        {items.length}
                      </span>
                    </div>
                    {isCollapsed ? (
                      <ChevronRight className="h-3.5 w-3.5 text-zinc-600" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-zinc-600" />
                    )}
                  </button>

                  {!isCollapsed && (
                    <div className="space-y-1 px-4 pb-3">
                      {items.map((insight) => (
                        <div
                          key={insight.id}
                          className={cn(
                            "animate-in fade-in slide-in-from-right-2 duration-300",
                            "rounded-lg border border-zinc-800/50 px-3 py-2",
                            "transition hover:border-zinc-700"
                          )}
                        >
                          <p className="text-sm leading-relaxed text-zinc-200">
                            {insight.content}
                          </p>
                          <div className="mt-1.5 flex items-center gap-3">
                            {insight.speaker && (
                              <span className="text-[10px] text-zinc-500">
                                {insight.speaker}
                              </span>
                            )}
                            {insight.timestamp != null && (
                              <span className="text-[10px] text-zinc-600">
                                at {formatTimestamp(insight.timestamp)}
                              </span>
                            )}
                            {insight.confidence != null && (
                              <span
                                className={cn(
                                  "text-[10px]",
                                  insight.confidence >= 0.8
                                    ? "text-emerald-600"
                                    : insight.confidence >= 0.5
                                      ? "text-amber-600"
                                      : "text-red-600"
                                )}
                              >
                                {Math.round(insight.confidence * 100)}%
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
