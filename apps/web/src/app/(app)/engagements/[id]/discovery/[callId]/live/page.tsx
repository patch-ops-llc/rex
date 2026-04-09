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
} from "lucide-react";
import { cn } from "@/lib/utils";

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

interface State {
  status: string;
  segments: Segment[];
  insights: Insight[];
  processing: boolean;
  connected: boolean;
}

type Action =
  | { type: "INIT"; payload: { status: string; segments: Segment[]; insights: Insight[] } }
  | { type: "ADD_SEGMENT"; payload: Segment }
  | { type: "ADD_INSIGHT"; payload: Insight }
  | { type: "SET_STATUS"; payload: string }
  | { type: "SET_PROCESSING"; payload: boolean }
  | { type: "SET_CONNECTED"; payload: boolean };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "INIT":
      return {
        ...state,
        status: action.payload.status,
        segments: action.payload.segments,
        insights: action.payload.insights,
        connected: true,
      };
    case "ADD_SEGMENT": {
      const exists = state.segments.some((s) => s.id === action.payload.id);
      if (exists) return state;
      return { ...state, segments: [...state.segments, action.payload] };
    }
    case "ADD_INSIGHT": {
      const exists = state.insights.some((i) => i.id === action.payload.id);
      if (exists) return state;
      return { ...state, insights: [...state.insights, action.payload] };
    }
    case "SET_STATUS":
      return { ...state, status: action.payload };
    case "SET_PROCESSING":
      return { ...state, processing: action.payload };
    case "SET_CONNECTED":
      return { ...state, connected: action.payload };
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
    processing: false,
    connected: false,
  });

  const [callMeta, setCallMeta] = useState({
    engagementName: "",
    clientName: "",
    callTitle: "",
    startedAt: null as string | null,
  });

  const [isFullscreen, setIsFullscreen] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
        if (data.status === "IN_PROGRESS" && !callMeta.startedAt) {
          setCallMeta((prev) => ({
            ...prev,
            startedAt: new Date().toISOString(),
          }));
        }
      }
    });

    es.addEventListener("processing", (e) => {
      const data = JSON.parse(e.data);
      dispatch({
        type: "SET_PROCESSING",
        payload: data.stage !== "complete",
      });
    });

    es.onopen = () => {
      dispatch({ type: "SET_CONNECTED", payload: true });
    };

    es.onerror = () => {
      dispatch({ type: "SET_CONNECTED", payload: false });
      es.close();
      reconnectTimeoutRef.current = setTimeout(connect, 3000);
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

      <div className="flex flex-1 overflow-hidden">
        {/* Transcript Panel */}
        <div className="flex w-[55%] flex-col border-r border-zinc-800">
          <LiveTranscript segments={state.segments} />
        </div>

        {/* Insights Panel */}
        <div className="flex w-[45%] flex-col">
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

function StatChip({
  icon: Icon,
  label,
  count,
  color,
}: {
  icon: typeof Lightbulb;
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className={cn("h-3.5 w-3.5", color)} />
      <span className="text-xs text-zinc-500">{label}</span>
      <span className={cn("text-xs font-bold", count > 0 ? color : "text-zinc-700")}>
        {count}
      </span>
    </div>
  );
}
