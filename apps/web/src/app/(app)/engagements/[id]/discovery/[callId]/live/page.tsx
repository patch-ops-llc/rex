"use client";

import { useEffect, useReducer, useRef, useState, useCallback } from "react";
import { CallHeader } from "@/components/discovery/call-header";
import { LiveTranscript } from "@/components/discovery/live-transcript";
import { InsightsPanel } from "@/components/discovery/insights-panel";
import {
  Lightbulb,
  ListTodo,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Loader2,
  ClipboardList,
  MessageCircleQuestion,
  Sparkles,
  ArrowRight,
  X,
  Volume2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

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

interface FinalizedData {
  summary: string | null;
  insightCounts: {
    total: number;
    requirements: number;
    actionItems: number;
    decisions: number;
    scopeConcerns: number;
    openQuestions: number;
  };
  duration: number | null;
  segmentCount: number;
}

interface RexSpeakingState {
  text: string;
  triggeredBy: string;
  question: string;
  timestamp: number;
}

interface State {
  status: string;
  segments: Segment[];
  insights: Insight[];
  agendaItems: AgendaItem[];
  suggestions: Suggestion[];
  rexSpeaking: RexSpeakingState | null;
  processing: boolean;
  connected: boolean;
  finalizing: boolean;
  finalizedData: FinalizedData | null;
}

type Action =
  | { type: "INIT"; payload: { status: string; segments: Segment[]; insights: Insight[]; agendaItems?: AgendaItem[]; finalizedData?: FinalizedData | null } }
  | { type: "ADD_SEGMENT"; payload: Segment }
  | { type: "ADD_INSIGHT"; payload: Insight }
  | { type: "UPSERT_AGENDA_ITEM"; payload: AgendaItem }
  | { type: "ADD_SUGGESTION"; payload: Suggestion }
  | { type: "DISMISS_SUGGESTION"; payload: string }
  | { type: "EXPIRE_SUGGESTIONS" }
  | { type: "REX_SPEAKING"; payload: RexSpeakingState }
  | { type: "REX_DONE_SPEAKING" }
  | { type: "SET_STATUS"; payload: string }
  | { type: "SET_PROCESSING"; payload: boolean }
  | { type: "SET_CONNECTED"; payload: boolean }
  | { type: "SET_FINALIZING"; payload: boolean }
  | { type: "SET_FINALIZED"; payload: FinalizedData };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "INIT":
      return {
        ...state,
        status: action.payload.status,
        segments: action.payload.segments,
        insights: action.payload.insights,
        agendaItems: action.payload.agendaItems || [],
        suggestions: [],
        connected: true,
        finalizedData: action.payload.finalizedData || null,
        finalizing: action.payload.status === "COMPLETED" && !action.payload.finalizedData,
      };
    case "ADD_SEGMENT": {
      const idx = state.segments.findIndex((s) => s.id === action.payload.id);
      if (idx >= 0) {
        const updated = [...state.segments];
        updated[idx] = action.payload;
        return { ...state, segments: updated };
      }
      return { ...state, segments: [...state.segments, action.payload] };
    }
    case "ADD_INSIGHT": {
      const exists = state.insights.some((i) => i.id === action.payload.id);
      if (exists) return state;
      return { ...state, insights: [...state.insights, action.payload] };
    }
    case "UPSERT_AGENDA_ITEM": {
      const aidx = state.agendaItems.findIndex((a) => a.id === action.payload.id);
      if (aidx >= 0) {
        const updated = [...state.agendaItems];
        updated[aidx] = action.payload;
        return { ...state, agendaItems: updated };
      }
      return {
        ...state,
        agendaItems: [...state.agendaItems, action.payload].sort(
          (a, b) => a.displayOrder - b.displayOrder
        ),
      };
    }
    case "ADD_SUGGESTION": {
      if (state.suggestions.some((s) => s.id === action.payload.id)) return state;
      return { ...state, suggestions: [...state.suggestions, action.payload].slice(-8) };
    }
    case "DISMISS_SUGGESTION":
      return { ...state, suggestions: state.suggestions.filter((s) => s.id !== action.payload) };
    case "EXPIRE_SUGGESTIONS": {
      const now = Date.now();
      const active = state.suggestions.filter((s) => now - s.receivedAt < 90_000);
      if (active.length === state.suggestions.length) return state;
      return { ...state, suggestions: active };
    }
    case "REX_SPEAKING":
      return { ...state, rexSpeaking: action.payload };
    case "REX_DONE_SPEAKING":
      return { ...state, rexSpeaking: null };
    case "SET_STATUS":
      return { ...state, status: action.payload };
    case "SET_PROCESSING":
      return { ...state, processing: action.payload };
    case "SET_CONNECTED":
      return { ...state, connected: action.payload };
    case "SET_FINALIZING":
      return { ...state, finalizing: action.payload };
    case "SET_FINALIZED":
      return { ...state, finalizing: false, finalizedData: action.payload };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LiveDashboardPage({
  params,
}: {
  params: { id: string; callId: string };
}) {
  const [state, dispatch] = useReducer(reducer, {
    status: "WAITING",
    segments: [],
    insights: [],
    agendaItems: [],
    suggestions: [],
    rexSpeaking: null,
    processing: false,
    connected: false,
    finalizing: false,
    finalizedData: null,
  });

  const [callMeta, setCallMeta] = useState({
    engagementName: "",
    clientName: "",
    callTitle: "",
    startedAt: null as string | null,
  });

  const [isFullscreen, setIsFullscreen] = useState(false);
  const statusRef = useRef(state.status);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => { statusRef.current = state.status; }, [state.status]);

  // Fetch call metadata
  useEffect(() => {
    async function fetchMeta() {
      try {
        const res = await fetch(`/api/engagements/${params.id}`);
        if (!res.ok) return;
        const engagement = await res.json();
        const call = engagement.discoveryCalls?.find(
          (c: any) => c.id === params.callId
        );
        setCallMeta({
          engagementName: engagement.name,
          clientName: engagement.clientName,
          callTitle: call?.title || "Discovery Call",
          startedAt: call?.startedAt || null,
        });
        if (call?.status) {
          dispatch({ type: "SET_STATUS", payload: call.status });
        }
      } catch {
        // Silently fail
      }
    }
    fetchMeta();
  }, [params.id, params.callId]);

  // SSE connection with auto-reconnect
  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource(
      `/api/engagements/${params.id}/discovery/${params.callId}/stream`
    );
    eventSourceRef.current = es;

    es.addEventListener("init", (e) => {
      const data = JSON.parse(e.data);
      dispatch({ type: "INIT", payload: data });
    });

    es.addEventListener("transcript", (e) => {
      const data = JSON.parse(e.data);
      if (data.segment) {
        dispatch({ type: "ADD_SEGMENT", payload: data.segment });
      }
    });

    es.addEventListener("insight", (e) => {
      const data = JSON.parse(e.data);
      if (data.insight) {
        dispatch({ type: "ADD_INSIGHT", payload: data.insight });
      }
    });

    es.addEventListener("status", (e) => {
      const data = JSON.parse(e.data);
      if (data.status) {
        dispatch({ type: "SET_STATUS", payload: data.status });
        if (data.status === "COMPLETED") {
          dispatch({ type: "SET_FINALIZING", payload: true });
        }
        if (data.status === "IN_PROGRESS" && !callMeta.startedAt) {
          setCallMeta((prev) => ({
            ...prev,
            startedAt: new Date().toISOString(),
          }));
        }
      }
    });

    es.addEventListener("agenda", (e) => {
      const data = JSON.parse(e.data);
      if (data.item) {
        dispatch({ type: "UPSERT_AGENDA_ITEM", payload: data.item });
      }
    });

    es.addEventListener("suggestion", (e) => {
      const data = JSON.parse(e.data);
      if (data.suggestion) {
        dispatch({
          type: "ADD_SUGGESTION",
          payload: { ...data.suggestion, receivedAt: Date.now() },
        });
      }
    });

    es.addEventListener("voice", (e) => {
      const data = JSON.parse(e.data);
      if (data.text) {
        dispatch({ type: "REX_SPEAKING", payload: data });
        setTimeout(() => {
          dispatch({ type: "REX_DONE_SPEAKING" });
        }, Math.min(data.text.length * 80, 15000));
      }
    });

    es.addEventListener("processing", (e) => {
      const data = JSON.parse(e.data);
      dispatch({
        type: "SET_PROCESSING",
        payload: data.stage !== "complete",
      });
    });

    es.addEventListener("call_ended", (e) => {
      const data = JSON.parse(e.data);
      dispatch({ type: "SET_FINALIZED", payload: data });
    });

    es.onopen = () => {
      dispatch({ type: "SET_CONNECTED", payload: true });
    };

    es.onerror = () => {
      dispatch({ type: "SET_CONNECTED", payload: false });
      es.close();
      if (statusRef.current !== "COMPLETED" && statusRef.current !== "FAILED") {
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      }
    };
  }, [params.id, params.callId, callMeta.startedAt]);

  useEffect(() => {
    connect();
    return () => {
      eventSourceRef.current?.close();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  // End session
  const endSession = useCallback(async () => {
    const res = await fetch(
      `/api/engagements/${params.id}/discovery/${params.callId}/stop`,
      { method: "POST" }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error("Failed to end session:", data.error);
    }
  }, [params.id, params.callId]);

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // Expire stale suggestions
  useEffect(() => {
    const interval = setInterval(() => {
      dispatch({ type: "EXPIRE_SUGGESTIONS" });
    }, 10_000);
    return () => clearInterval(interval);
  }, []);

  const dismissSuggestion = useCallback((id: string) => {
    dispatch({ type: "DISMISS_SUGGESTION", payload: id });
  }, []);

  // Insight counts for bottom bar
  const counts = {
    requirements: state.insights.filter((i) => i.type === "REQUIREMENT").length,
    actionItems: state.insights.filter((i) => i.type === "ACTION_ITEM").length,
    decisions: state.insights.filter((i) => i.type === "DECISION").length,
    scopeConcerns: state.insights.filter((i) => i.type === "SCOPE_CONCERN")
      .length,
    openQuestions: state.insights.filter((i) => i.type === "OPEN_QUESTION")
      .length,
  };

  const speakers = new Set(state.segments.map((s) => s.speaker));

  return (
    <div
      className={cn(
        "flex h-screen flex-col bg-zinc-950 text-zinc-100",
        isFullscreen && "fixed inset-0 z-50"
      )}
    >
      <CallHeader
        engagementName={callMeta.engagementName}
        clientName={callMeta.clientName}
        callTitle={callMeta.callTitle}
        status={state.status}
        startedAt={callMeta.startedAt}
        speakerCount={speakers.size}
        connected={state.connected}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        onEndSession={endSession}
      />

      {state.status === "COMPLETED" && (
        <div
          className={cn(
            "flex items-center justify-between border-b px-6 py-3",
            state.finalizedData
              ? "border-emerald-500/20 bg-emerald-950/30"
              : "border-blue-500/20 bg-blue-950/30"
          )}
        >
          {state.finalizedData ? (
            <>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span className="text-sm text-emerald-300">
                  Discovery complete &mdash; {state.finalizedData.insightCounts.total} insights captured
                  ({state.finalizedData.insightCounts.requirements} requirements,{" "}
                  {state.finalizedData.insightCounts.actionItems} action items,{" "}
                  {state.finalizedData.insightCounts.decisions} decisions)
                </span>
              </div>
              <Link
                href={`/engagements/${params.id}`}
                className="text-sm font-medium text-emerald-400 transition-colors hover:text-emerald-300"
              >
                View Full Results &rarr;
              </Link>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
              <span className="text-sm text-blue-300">
                Call ended &mdash; processing insights and action items...
              </span>
            </div>
          )}
        </div>
      )}

      {/* Rex Speaking Banner */}
      {state.rexSpeaking && (
        <RexSpeakingBanner
          text={state.rexSpeaking.text}
          triggeredBy={state.rexSpeaking.triggeredBy}
          question={state.rexSpeaking.question}
        />
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Transcript Panel */}
        <div className="flex w-[55%] flex-col border-r border-zinc-800">
          <LiveTranscript segments={state.segments} />
        </div>

        {/* Insights + Suggestions Panel */}
        <div className="flex w-[45%] flex-col">
          {state.suggestions.length > 0 && (
            <SuggestionsPanel
              suggestions={state.suggestions}
              onDismiss={dismissSuggestion}
            />
          )}
          <InsightsPanel insights={state.insights} />
        </div>
      </div>

      {/* Bottom Stats Bar */}
      <footer className="flex items-center justify-between border-t border-zinc-800 bg-zinc-950 px-6 py-2">
        <div className="flex items-center gap-6">
          <StatChip
            icon={Lightbulb}
            label="Requirements"
            count={counts.requirements}
            color="text-blue-400"
          />
          <StatChip
            icon={ListTodo}
            label="Action Items"
            count={counts.actionItems}
            color="text-amber-400"
          />
          <StatChip
            icon={CheckCircle2}
            label="Decisions"
            count={counts.decisions}
            color="text-emerald-400"
          />
          <StatChip
            icon={AlertTriangle}
            label="Scope Risks"
            count={counts.scopeConcerns}
            color="text-red-400"
          />
          <StatChip
            icon={HelpCircle}
            label="Open Qs"
            count={counts.openQuestions}
            color="text-orange-400"
          />
          {state.agendaItems.length > 0 && (
            <StatChip
              icon={ClipboardList}
              label="Agenda"
              count={state.agendaItems.filter((a) => a.status === "RESOLVED").length}
              color="text-emerald-400"
              suffix={`/${state.agendaItems.length}`}
            />
          )}
        </div>

        <div className="flex items-center gap-3">
          {state.processing && (
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Processing...</span>
            </div>
          )}
          <span className="text-xs text-zinc-600">
            {state.segments.length} segments &middot; {state.insights.length}{" "}
            insights
          </span>
        </div>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat Chip
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Rex Speaking Banner
// ---------------------------------------------------------------------------

function RexSpeakingBanner({
  text,
  triggeredBy,
  question,
}: {
  text: string;
  triggeredBy: string;
  question: string;
}) {
  return (
    <div className="border-b border-emerald-500/30 bg-gradient-to-r from-emerald-950/40 via-zinc-950 to-emerald-950/40 px-6 py-3">
      <div className="flex items-start gap-3">
        <div className="flex shrink-0 items-center gap-2">
          <div className="relative flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/20">
            <Volume2 className="h-4 w-4 text-emerald-400 animate-pulse" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-emerald-400">
              Rex is speaking
            </span>
            <span className="text-[10px] text-zinc-500">
              responding to {triggeredBy}
            </span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-relaxed text-zinc-200 italic">
            &ldquo;{text}&rdquo;
          </p>
          <p className="mt-1 text-[11px] text-zinc-600">
            Q: &ldquo;{question.length > 100 ? question.slice(0, 100) + "..." : question}&rdquo;
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Suggestions Panel
// ---------------------------------------------------------------------------

const SUGGESTION_TYPE_CONFIG: Record<
  string,
  { icon: typeof MessageCircleQuestion; color: string; bgColor: string; borderColor: string; label: string }
> = {
  question: {
    icon: MessageCircleQuestion,
    color: "text-sky-400",
    bgColor: "bg-sky-500/10",
    borderColor: "border-sky-500/30",
    label: "Suggested Question",
  },
  coaching_tip: {
    icon: Sparkles,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
    label: "Coaching Tip",
  },
  topic_prompt: {
    icon: ArrowRight,
    color: "text-violet-400",
    bgColor: "bg-violet-500/10",
    borderColor: "border-violet-500/30",
    label: "Topic Prompt",
  },
};

function SuggestionsPanel({
  suggestions,
  onDismiss,
}: {
  suggestions: Suggestion[];
  onDismiss: (id: string) => void;
}) {
  const sorted = [...suggestions].sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  return (
    <div className="border-b border-sky-500/20 bg-gradient-to-b from-sky-950/30 to-transparent">
      <div className="flex items-center gap-2 border-b border-zinc-800/50 px-4 py-2">
        <Sparkles className="h-3.5 w-3.5 text-sky-400" />
        <h2 className="text-xs font-semibold uppercase tracking-wider text-sky-400">
          Rex Suggests
        </h2>
        <span className="text-[10px] text-zinc-600">
          {suggestions.length} active
        </span>
      </div>
      <div className="max-h-[240px] space-y-1.5 overflow-y-auto px-4 py-2.5">
        {sorted.map((suggestion) => {
          const config =
            SUGGESTION_TYPE_CONFIG[suggestion.suggestionType] ||
            SUGGESTION_TYPE_CONFIG.coaching_tip;
          const Icon = config.icon;

          return (
            <div
              key={suggestion.id}
              className={cn(
                "group relative rounded-lg border px-3 py-2 transition-all",
                config.borderColor,
                config.bgColor,
                suggestion.priority === "high" && "ring-1 ring-sky-500/20"
              )}
            >
              <button
                onClick={() => onDismiss(suggestion.id)}
                className="absolute right-1.5 top-1.5 rounded p-0.5 text-zinc-600 opacity-0 transition hover:text-zinc-300 group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
              <div className="flex items-start gap-2">
                <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", config.color)} />
                <div className="min-w-0 pr-4">
                  <div className="mb-0.5 flex items-center gap-2">
                    <span className={cn("text-[10px] font-semibold uppercase tracking-wider", config.color)}>
                      {config.label}
                    </span>
                    {suggestion.priority === "high" && (
                      <span className="rounded bg-sky-500/20 px-1 text-[9px] font-bold uppercase text-sky-300">
                        Priority
                      </span>
                    )}
                  </div>
                  <p className="text-sm leading-relaxed text-zinc-200">
                    {suggestion.content}
                  </p>
                  {suggestion.reasoning && (
                    <p className="mt-1 text-[11px] leading-snug text-zinc-500">
                      {suggestion.reasoning}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat Chip
// ---------------------------------------------------------------------------

function StatChip({
  icon: Icon,
  label,
  count,
  color,
  suffix,
}: {
  icon: typeof Lightbulb;
  label: string;
  count: number;
  color: string;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className={cn("h-3.5 w-3.5", color)} />
      <span className="text-xs text-zinc-500">{label}</span>
      <span className={cn("text-xs font-bold", count > 0 ? color : "text-zinc-700")}>
        {count}{suffix || ""}
      </span>
    </div>
  );
}
