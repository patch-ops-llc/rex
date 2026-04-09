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
  Circle,
  CircleDot,
  CircleCheckBig,
  CircleDashed,
  SkipForward,
  MessageCircleQuestion,
  Sparkles,
  ArrowRight,
  Volume2,
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

interface AgendaItem {
  id: string;
  title: string;
  description: string | null;
  status: string;
  displayOrder: number;
  notes: string | null;
  resolvedAt: string | null;
  relatedInsights: string[] | null;
}

interface Suggestion {
  id: string;
  suggestionType: "question" | "coaching_tip" | "topic_prompt";
  content: string;
  reasoning: string;
  priority: "high" | "medium" | "low";
  relatedAgendaItemId?: string;
  receivedAt: number;
}

interface RexSpeakingState {
  text: string;
  triggeredBy: string;
  timestamp: number;
}

interface DiscoveryViewProps {
  segments: Segment[];
  insights: Insight[];
  agendaItems: AgendaItem[];
  suggestions: Suggestion[];
  rexSpeaking: RexSpeakingState | null;
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

const AGENDA_STATUS_CONFIG: Record<
  string,
  { icon: typeof Circle; color: string; bgColor: string; label: string }
> = {
  PENDING: { icon: Circle, color: "text-zinc-500", bgColor: "bg-zinc-800/50", label: "Pending" },
  ACTIVE: { icon: CircleDot, color: "text-blue-400", bgColor: "bg-blue-500/10", label: "Discussing" },
  RESOLVED: { icon: CircleCheckBig, color: "text-emerald-400", bgColor: "bg-emerald-500/10", label: "Resolved" },
  PARTIALLY_RESOLVED: { icon: CircleDashed, color: "text-amber-400", bgColor: "bg-amber-500/10", label: "Partial" },
  SKIPPED: { icon: SkipForward, color: "text-zinc-600", bgColor: "bg-zinc-800/30", label: "Skipped" },
};

export function DiscoveryView({
  segments,
  insights,
  agendaItems,
  suggestions,
  rexSpeaking,
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

      {/* Agenda progress bar */}
      {agendaItems.length > 0 && (
        <AgendaTracker items={agendaItems} />
      )}

      {/* Rex speaking indicator */}
      {rexSpeaking && (
        <RexSpeakingBanner text={rexSpeaking.text} triggeredBy={rexSpeaking.triggeredBy} />
      )}

      {/* Live suggestions bar */}
      {suggestions.length > 0 && !rexSpeaking && (
        <SuggestionsBar suggestions={suggestions} />
      )}

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
          {agendaItems.length > 0 && (
            <span>
              {agendaItems.filter((a) => a.status === "RESOLVED").length}/{agendaItems.length} agenda
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rex Speaking Banner
// ---------------------------------------------------------------------------

function RexSpeakingBanner({ text, triggeredBy }: { text: string; triggeredBy: string }) {
  return (
    <div className="border-b border-emerald-500/30 bg-gradient-to-r from-emerald-950/50 via-zinc-950/60 to-emerald-950/50">
      <div className="flex items-start gap-3 px-5 py-3">
        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          <div className="relative flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20">
            <Volume2 className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />
          </div>
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400">
              Rex speaking
            </span>
            <span className="ml-2 text-[10px] text-zinc-600">
              responding to {triggeredBy}
            </span>
          </div>
        </div>
        <p className="flex-1 text-[14px] leading-relaxed text-zinc-200 italic">
          &ldquo;{text}&rdquo;
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Suggestions Bar
// ---------------------------------------------------------------------------

const SUGGESTION_TYPE_CONFIG: Record<
  string,
  { icon: typeof MessageCircleQuestion; color: string; bgColor: string; borderColor: string; label: string }
> = {
  question: {
    icon: MessageCircleQuestion,
    color: "text-sky-300",
    bgColor: "bg-sky-500/10",
    borderColor: "border-sky-500/30",
    label: "Ask",
  },
  coaching_tip: {
    icon: Sparkles,
    color: "text-amber-300",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
    label: "Tip",
  },
  topic_prompt: {
    icon: ArrowRight,
    color: "text-violet-300",
    bgColor: "bg-violet-500/10",
    borderColor: "border-violet-500/30",
    label: "Next",
  },
};

function SuggestionsBar({ suggestions }: { suggestions: Suggestion[] }) {
  const sorted = [...suggestions].sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  const topSuggestions = sorted.slice(0, 3);

  return (
    <div className="border-b border-sky-500/20 bg-gradient-to-r from-sky-950/40 via-zinc-950/60 to-sky-950/40">
      <div className="flex items-start gap-3 px-5 py-2.5">
        <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
          <Sparkles className="h-3.5 w-3.5 text-sky-400" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-sky-400">
            Rex suggests
          </span>
        </div>

        <div className="flex flex-1 flex-wrap gap-2">
          {topSuggestions.map((suggestion) => {
            const config =
              SUGGESTION_TYPE_CONFIG[suggestion.suggestionType] ||
              SUGGESTION_TYPE_CONFIG.coaching_tip;
            const Icon = config.icon;

            return (
              <div
                key={suggestion.id}
                className={cn(
                  "flex max-w-[400px] items-start gap-2 rounded-lg border px-3 py-1.5 animate-slide-in",
                  config.borderColor,
                  config.bgColor,
                  suggestion.priority === "high" && "ring-1 ring-sky-500/20"
                )}
              >
                <Icon
                  className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", config.color)}
                />
                <div className="min-w-0">
                  <p className="text-[13px] leading-snug text-zinc-200">
                    {suggestion.content}
                  </p>
                  {suggestion.reasoning && (
                    <p className="mt-0.5 text-[10px] leading-tight text-zinc-500">
                      {suggestion.reasoning}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agenda Tracker
// ---------------------------------------------------------------------------

function AgendaTracker({ items }: { items: AgendaItem[] }) {
  const resolved = items.filter(
    (i) => i.status === "RESOLVED" || i.status === "SKIPPED"
  ).length;
  const active = items.find((i) => i.status === "ACTIVE");
  const progress = items.length > 0 ? (resolved / items.length) * 100 : 0;

  return (
    <div className="border-b border-zinc-800/40 bg-zinc-950/60">
      {/* Progress bar */}
      <div className="h-0.5 bg-zinc-800/40">
        <div
          className="h-full bg-emerald-500 transition-all duration-700 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex items-center gap-4 px-5 py-2">
        <div className="flex items-center gap-1.5">
          <ListTodo className="h-3.5 w-3.5 text-zinc-500" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            Agenda
          </span>
          <span className="text-[10px] text-zinc-600">
            {resolved}/{items.length}
          </span>
        </div>

        <div className="flex flex-1 items-center gap-1 overflow-x-auto">
          {items.map((item) => {
            const config = AGENDA_STATUS_CONFIG[item.status] || AGENDA_STATUS_CONFIG.PENDING;
            const Icon = config.icon;
            const isActive = item.status === "ACTIVE";

            return (
              <div
                key={item.id}
                className={cn(
                  "flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] transition-all",
                  isActive
                    ? "border border-blue-500/40 bg-blue-500/10 text-blue-300"
                    : item.status === "RESOLVED"
                      ? "text-emerald-400/70"
                      : item.status === "PARTIALLY_RESOLVED"
                        ? "text-amber-400/70"
                        : item.status === "SKIPPED"
                          ? "text-zinc-600 line-through"
                          : "text-zinc-500"
                )}
              >
                <Icon className="h-3 w-3 shrink-0" />
                <span className="max-w-[120px] truncate">
                  {item.title}
                </span>
              </div>
            );
          })}
        </div>

        {active && (
          <div className="flex shrink-0 items-center gap-1.5 text-[11px] text-blue-400">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-500" />
            </span>
            <span className="font-medium">Discussing</span>
          </div>
        )}
      </div>

      {/* Active item detail */}
      {active && active.notes && (
        <div className="border-t border-zinc-800/30 px-5 py-1.5">
          <p className="text-[11px] leading-relaxed text-zinc-400">
            <span className="font-semibold text-blue-400">{active.title}:</span>{" "}
            {active.notes.split("\n").pop()}
          </p>
        </div>
      )}
    </div>
  );
}
