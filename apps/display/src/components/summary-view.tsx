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
  bgColor: string;
}> = [
  { type: "REQUIREMENT", label: "Requirements", icon: Lightbulb, color: "text-blue-400", bgColor: "bg-blue-500/10" },
  { type: "ACTION_ITEM", label: "Action Items", icon: ListTodo, color: "text-amber-400", bgColor: "bg-amber-500/10" },
  { type: "DECISION", label: "Decisions", icon: CheckCircle2, color: "text-emerald-400", bgColor: "bg-emerald-500/10" },
  { type: "SCOPE_CONCERN", label: "Scope Risks", icon: AlertTriangle, color: "text-red-400", bgColor: "bg-red-500/10" },
  { type: "SYSTEM_MENTION", label: "Systems", icon: Monitor, color: "text-purple-400", bgColor: "bg-purple-500/10" },
  { type: "TIMELINE", label: "Timeline", icon: CalendarClock, color: "text-cyan-400", bgColor: "bg-cyan-500/10" },
  { type: "OPEN_QUESTION", label: "Open Questions", icon: HelpCircle, color: "text-orange-400", bgColor: "bg-orange-500/10" },
  { type: "STAKEHOLDER_NOTE", label: "Stakeholders", icon: UserCircle, color: "text-rose-400", bgColor: "bg-rose-500/10" },
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
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800/60 px-6 py-4">
        <div className="flex items-center gap-4">
          <CheckCircle className="h-6 w-6 text-emerald-400" />
          <div>
            <div className="text-lg font-semibold text-zinc-100">
              Discovery Session Complete
            </div>
            <div className="text-sm text-zinc-500">
              {callTitle}
              {clientName && ` — ${clientName}`}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-lg text-zinc-400">{elapsed}</div>
          <div className="text-xs text-zinc-600">
            {segmentCount} segments · {insights.length} insights
          </div>
        </div>
      </div>

      {/* Summary grid */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {/* Stats row */}
        <div className="mb-6 grid grid-cols-4 gap-3">
          {SUMMARY_CATEGORIES.slice(0, 4).map((cat) => {
            const count = grouped[cat.type]?.length || 0;
            const Icon = cat.icon;
            return (
              <div
                key={cat.type}
                className="flex items-center gap-3 rounded-lg border border-zinc-800/50 bg-zinc-900/40 px-4 py-3"
              >
                <Icon className={cn("h-5 w-5", cat.color)} />
                <div>
                  <div className={cn("text-xl font-bold", count > 0 ? cat.color : "text-zinc-700")}>
                    {count}
                  </div>
                  <div className="text-xs text-zinc-600">{cat.label}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Key findings */}
        <div className="grid grid-cols-2 gap-4">
          {categoriesWithData.map((cat) => {
            const items = grouped[cat.type];
            const Icon = cat.icon;
            return (
              <div
                key={cat.type}
                className="rounded-lg border border-zinc-800/50 bg-zinc-900/20 p-4"
              >
                <div className="mb-2 flex items-center gap-2">
                  <Icon className={cn("h-4 w-4", cat.color)} />
                  <span className={cn("text-sm font-semibold", cat.color)}>
                    {cat.label}
                  </span>
                  <span className={cn("text-xs", cat.color)}>
                    ({items.length})
                  </span>
                </div>
                <ul className="space-y-1">
                  {items.slice(0, 4).map((item) => (
                    <li
                      key={item.id}
                      className="text-sm leading-relaxed text-zinc-300"
                    >
                      • {item.content}
                    </li>
                  ))}
                  {items.length > 4 && (
                    <li className="text-xs text-zinc-600">
                      +{items.length - 4} more
                    </li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom branding */}
      <div className="flex items-center justify-center border-t border-zinc-800/40 py-2">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-patchops">
            <span className="text-[10px] font-black text-white">R</span>
          </div>
          <span className="text-xs text-zinc-600">
            REX by PatchOps · Full report available in your dashboard
          </span>
        </div>
      </div>
    </div>
  );
}
