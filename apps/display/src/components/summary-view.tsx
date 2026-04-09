"use client";

import {
  Lightbulb,
  ListTodo,
  CheckCircle2,
  AlertTriangle,
  Monitor,
  CalendarClock,
  HelpCircle,
  UserCircle,
  CheckCircle,
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

interface SummaryViewProps {
  insights: Insight[];
  segmentCount: number;
  elapsed: string;
  clientName: string;
  callTitle: string;
}

const SUMMARY_CATEGORIES: Array<{
  type: string;
  label: string;
  icon: typeof Lightbulb;
  color: string;
  borderColor: string;
}> = [
  { type: "REQUIREMENT", label: "Requirements", icon: Lightbulb, color: "text-blue-400", borderColor: "border-l-blue-500" },
  { type: "ACTION_ITEM", label: "Action Items", icon: ListTodo, color: "text-amber-400", borderColor: "border-l-amber-500" },
  { type: "DECISION", label: "Decisions", icon: CheckCircle2, color: "text-emerald-400", borderColor: "border-l-emerald-500" },
  { type: "SCOPE_CONCERN", label: "Scope Risks", icon: AlertTriangle, color: "text-red-400", borderColor: "border-l-red-500" },
  { type: "SYSTEM_MENTION", label: "Systems", icon: Monitor, color: "text-purple-400", borderColor: "border-l-purple-500" },
  { type: "TIMELINE", label: "Timeline", icon: CalendarClock, color: "text-cyan-400", borderColor: "border-l-cyan-500" },
  { type: "OPEN_QUESTION", label: "Open Questions", icon: HelpCircle, color: "text-orange-400", borderColor: "border-l-orange-500" },
  { type: "STAKEHOLDER_NOTE", label: "Stakeholders", icon: UserCircle, color: "text-rose-400", borderColor: "border-l-rose-500" },
];

export function SummaryView({
  insights,
  segmentCount,
  elapsed,
  clientName,
  callTitle,
}: SummaryViewProps) {
  const grouped: Record<string, Insight[]> = {};
  for (const insight of insights) {
    if (!grouped[insight.type]) grouped[insight.type] = [];
    grouped[insight.type].push(insight);
  }

  const categoriesWithData = SUMMARY_CATEGORIES.filter(
    (cat) => grouped[cat.type]?.length
  );

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800/50 px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15">
            <CheckCircle className="h-4 w-4 text-emerald-400" />
          </div>
          <div>
            <div className="text-base font-semibold text-zinc-100">
              Session Complete
            </div>
            <div className="text-xs text-zinc-500">
              {callTitle}
              {clientName && ` — ${clientName}`}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-sm text-zinc-400">{elapsed}</div>
          <div className="text-[10px] text-zinc-600">
            {segmentCount} segments · {insights.length} insights
          </div>
        </div>
      </div>

      {/* Stats strip */}
      <div className="flex items-center gap-2 border-b border-zinc-800/30 px-6 py-2">
        {SUMMARY_CATEGORIES.slice(0, 6).map((cat) => {
          const count = grouped[cat.type]?.length || 0;
          const Icon = cat.icon;
          return (
            <div
              key={cat.type}
              className="flex items-center gap-1.5 rounded-full bg-zinc-900/50 px-2.5 py-1"
            >
              <Icon className={cn("h-3 w-3", count > 0 ? cat.color : "text-zinc-700")} />
              <span className={cn("text-xs font-semibold", count > 0 ? cat.color : "text-zinc-700")}>
                {count}
              </span>
              <span className="text-[10px] text-zinc-600">{cat.label}</span>
            </div>
          );
        })}
      </div>

      {/* Summary grid */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="grid grid-cols-2 gap-3">
          {categoriesWithData.map((cat) => {
            const items = grouped[cat.type];
            const Icon = cat.icon;
            return (
              <div
                key={cat.type}
                className="rounded-lg border border-zinc-800/40 bg-zinc-900/20 p-3"
              >
                <div className="mb-2 flex items-center gap-2">
                  <Icon className={cn("h-3.5 w-3.5", cat.color)} />
                  <span className={cn("text-xs font-semibold uppercase tracking-wider", cat.color)}>
                    {cat.label}
                  </span>
                  <span className="text-[10px] text-zinc-600">
                    {items.length}
                  </span>
                </div>
                <ul className="space-y-1">
                  {items.slice(0, 4).map((item) => (
                    <li
                      key={item.id}
                      className={cn(
                        "rounded-r border-l-2 bg-zinc-900/30 px-2.5 py-1 text-[12px] leading-snug text-zinc-300",
                        cat.borderColor
                      )}
                    >
                      {item.content}
                    </li>
                  ))}
                  {items.length > 4 && (
                    <li className="pl-3 text-[10px] text-zinc-600">
                      +{items.length - 4} more in dashboard
                    </li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-center border-t border-zinc-800/40 py-1.5">
        <div className="flex items-center gap-2">
          <div className="flex h-4 w-4 items-center justify-center rounded bg-patchops">
            <span className="text-[8px] font-black text-white">R</span>
          </div>
          <span className="text-[10px] text-zinc-600">
            Rex by PatchOps · Full report in your dashboard
          </span>
        </div>
      </div>
    </div>
  );
}
