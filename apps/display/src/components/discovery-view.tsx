"use client";

import { useEffect, useRef, useState } from "react";
import {
  Lightbulb,
  ListTodo,
  CheckCircle2,
  AlertTriangle,
  Monitor,
  CalendarClock,
  HelpCircle,
  UserCircle,
} from "lucide-react";
import { cn, formatTime } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Segment {
  id: string;
  speaker: string;
  text: string;
  startTime: number;
  endTime: number;
  isFinal: boolean;
}

interface Insight {
  id: string;
  type: string;
  content: string;
  speaker: string | null;
  timestamp: number | null;
  confidence: number | null;
  metadata: Record<string, unknown> | null;
}

interface DiscoveryViewProps {
  segments: Segment[];
  insights: Insight[];
  elapsed: string;
  clientName: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const INSIGHT_CATEGORIES: Array<{
  type: string;
  label: string;
  icon: typeof Lightbulb;
  color: string;
  bgColor: string;
}> = [
  { type: "REQUIREMENT", label: "Requirements", icon: Lightbulb, color: "text-blue-400", bgColor: "bg-blue-500/10" },
  { type: "DECISION", label: "Decisions", icon: CheckCircle2, color: "text-emerald-400", bgColor: "bg-emerald-500/10" },
  { type: "SYSTEM_MENTION", label: "Systems", icon: Monitor, color: "text-purple-400", bgColor: "bg-purple-500/10" },
  { type: "SCOPE_CONCERN", label: "Scope Risks", icon: AlertTriangle, color: "text-red-400", bgColor: "bg-red-500/10" },
  { type: "TIMELINE", label: "Timeline", icon: CalendarClock, color: "text-cyan-400", bgColor: "bg-cyan-500/10" },
  { type: "STAKEHOLDER_NOTE", label: "Stakeholders", icon: UserCircle, color: "text-rose-400", bgColor: "bg-rose-500/10" },
];

const RIGHT_COLUMN_TYPES = ["ACTION_ITEM", "OPEN_QUESTION"];

const RIGHT_COLUMN_CONFIG: Record<
  string,
  { label: string; icon: typeof ListTodo; color: string }
> = {
  ACTION_ITEM: { label: "Action Items", icon: ListTodo, color: "text-amber-400" },
  OPEN_QUESTION: { label: "Open Questions", icon: HelpCircle, color: "text-orange-400" },
};

const SPEAKER_COLORS = [
  "text-blue-400",
  "text-emerald-400",
  "text-amber-400",
  "text-purple-400",
  "text-rose-400",
  "text-cyan-400",
];

const speakerColorMap: Record<string, string> = {};

function getSpeakerColor(speaker: string): string {
  if (!speakerColorMap[speaker]) {
    const idx = Object.keys(speakerColorMap).length % SPEAKER_COLORS.length;
    speakerColorMap[speaker] = SPEAKER_COLORS[idx];
  }
  return speakerColorMap[speaker];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DiscoveryView({
  segments,
  insights,
  elapsed,
  clientName,
}: DiscoveryViewProps) {
  const transcriptRef = useRef<HTMLDivElement>(null);
  const [newInsightIds, setNewInsightIds] = useState<Set<string>>(new Set());
  const prevInsightCountRef = useRef(0);

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [segments.length]);

  // Track newly-arrived insights for glow animation
  useEffect(() => {
    if (insights.length > prevInsightCountRef.current) {
      const newOnes = insights
        .slice(prevInsightCountRef.current)
        .map((i) => i.id);
      setNewInsightIds((prev) => new Set([...prev, ...newOnes]));
      const timeout = setTimeout(() => {
        setNewInsightIds((prev) => {
          const next = new Set(prev);
          newOnes.forEach((id) => next.delete(id));
          return next;
        });
      }, 2500);
      prevInsightCountRef.current = insights.length;
      return () => clearTimeout(timeout);
    }
  }, [insights]);

  // Group consecutive transcript segments by speaker
  const transcriptGroups: Array<{
    speaker: string;
    startTime: number;
    texts: string[];
  }> = [];

  for (const seg of segments) {
    const last = transcriptGroups[transcriptGroups.length - 1];
    if (last && last.speaker === seg.speaker) {
      last.texts.push(seg.text);
    } else {
      transcriptGroups.push({
        speaker: seg.speaker,
        startTime: seg.startTime,
        texts: [seg.text],
      });
    }
  }

  // Only show the last ~8 transcript groups to keep it readable
  const visibleTranscript = transcriptGroups.slice(-8);

  // Split insights into left (facts) and right (action/questions)
  const leftInsights = insights.filter(
    (i) => !RIGHT_COLUMN_TYPES.includes(i.type)
  );
  const rightInsights = insights.filter((i) =>
    RIGHT_COLUMN_TYPES.includes(i.type)
  );

  // Group left insights by type
  const leftGrouped: Record<string, Insight[]> = {};
  for (const insight of leftInsights) {
    if (!leftGrouped[insight.type]) leftGrouped[insight.type] = [];
    leftGrouped[insight.type].push(insight);
  }

  // Group right insights by type
  const rightGrouped: Record<string, Insight[]> = {};
  for (const insight of rightInsights) {
    if (!rightGrouped[insight.type]) rightGrouped[insight.type] = [];
    rightGrouped[insight.type].push(insight);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-zinc-800/60 px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
            </span>
            <span className="text-sm font-semibold uppercase tracking-wider text-red-400">
              Live
            </span>
          </div>
          <span className="text-zinc-700">|</span>
          <span className="text-sm font-medium text-zinc-400">
            {clientName || "Discovery Call"}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <span className="font-mono text-sm text-zinc-500">{elapsed}</span>
          <div className="flex items-center gap-1.5 text-xs text-zinc-600">
            <span>{insights.length} insights</span>
          </div>
        </div>
      </div>

      {/* Main content: two columns */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left column: key findings + transcript */}
        <div className="flex w-[62%] flex-col border-r border-zinc-800/40">
          {/* Findings */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {INSIGHT_CATEGORIES.filter((cat) => leftGrouped[cat.type]?.length).length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <div className="text-lg text-zinc-600">
                    Listening and analyzing...
                  </div>
                  <div className="mt-2 text-sm text-zinc-700">
                    Key findings will appear here as the conversation unfolds.
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {INSIGHT_CATEGORIES.filter(
                  (cat) => leftGrouped[cat.type]?.length
                ).map((cat) => {
                  const items = leftGrouped[cat.type];
                  const Icon = cat.icon;
                  return (
                    <div key={cat.type}>
                      <div className="mb-2 flex items-center gap-2">
                        <Icon className={cn("h-4 w-4", cat.color)} />
                        <span
                          className={cn(
                            "text-sm font-semibold uppercase tracking-wider",
                            cat.color
                          )}
                        >
                          {cat.label}
                        </span>
                        <span
                          className={cn(
                            "flex h-5 min-w-5 items-center justify-center rounded-full text-xs font-bold",
                            cat.bgColor,
                            cat.color
                          )}
                        >
                          {items.length}
                        </span>
                      </div>
                      <div className="space-y-1.5 pl-6">
                        {items.slice(-5).map((insight) => (
                          <div
                            key={insight.id}
                            className={cn(
                              "rounded-lg border px-3 py-2 transition-all",
                              newInsightIds.has(insight.id)
                                ? "animate-slide-in border-green-500/50 bg-green-500/5"
                                : "border-zinc-800/50 bg-zinc-900/30"
                            )}
                          >
                            <p className="text-[15px] leading-relaxed text-zinc-200">
                              {insight.content}
                            </p>
                            {insight.speaker && (
                              <span className="mt-1 inline-block text-xs text-zinc-600">
                                — {insight.speaker}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Transcript ticker at bottom */}
          <div className="border-t border-zinc-800/40 bg-zinc-950/80">
            <div className="px-5 py-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
                Transcript
              </span>
            </div>
            <div
              ref={transcriptRef}
              className="max-h-[140px] overflow-y-auto px-5 pb-3"
            >
              <div className="space-y-1.5">
                {visibleTranscript.map((group, i) => (
                  <div key={i} className="flex gap-2">
                    <span
                      className={cn(
                        "shrink-0 text-xs font-semibold",
                        getSpeakerColor(group.speaker)
                      )}
                    >
                      {group.speaker}
                    </span>
                    <span className="text-xs leading-relaxed text-zinc-400">
                      {group.texts.join(" ")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right column: action items + open questions */}
        <div className="flex w-[38%] flex-col overflow-y-auto px-5 py-4">
          {Object.keys(rightGrouped).length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center text-sm text-zinc-700">
                Action items and open questions will appear here.
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {RIGHT_COLUMN_TYPES.filter(
                (type) => rightGrouped[type]?.length
              ).map((type) => {
                const config = RIGHT_COLUMN_CONFIG[type];
                const items = rightGrouped[type];
                const Icon = config.icon;
                return (
                  <div key={type}>
                    <div className="mb-2 flex items-center gap-2">
                      <Icon className={cn("h-4 w-4", config.color)} />
                      <span
                        className={cn(
                          "text-sm font-semibold uppercase tracking-wider",
                          config.color
                        )}
                      >
                        {config.label}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {items.map((insight, idx) => (
                        <div
                          key={insight.id}
                          className={cn(
                            "flex gap-2 rounded-lg border px-3 py-2 transition-all",
                            newInsightIds.has(insight.id)
                              ? "animate-slide-in border-green-500/50 bg-green-500/5"
                              : "border-zinc-800/50 bg-zinc-900/30"
                          )}
                        >
                          <span className="shrink-0 text-xs font-bold text-zinc-600 mt-0.5">
                            {idx + 1}.
                          </span>
                          <div>
                            <p className="text-[15px] leading-relaxed text-zinc-200">
                              {insight.content}
                            </p>
                            {insight.speaker && (
                              <span className="mt-1 inline-block text-xs text-zinc-600">
                                → {insight.speaker}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Bottom branding */}
      <div className="flex items-center justify-between border-t border-zinc-800/40 px-5 py-1.5">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-patchops">
            <span className="text-[10px] font-black text-white">R</span>
          </div>
          <span className="text-xs text-zinc-700">
            REX by PatchOps
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs text-zinc-700">
          <span>{segments.length} segments</span>
          <span>{insights.length} insights</span>
        </div>
      </div>
    </div>
  );
}
