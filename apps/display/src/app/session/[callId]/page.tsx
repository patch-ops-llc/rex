"use client";

import { useEffect, useReducer, useRef, useState, useCallback } from "react";
import { IntroView } from "@/components/intro-view";
import { DiscoveryView } from "@/components/discovery-view";
import { SummaryView } from "@/components/summary-view";
import { formatElapsed } from "@/lib/utils";

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
  expiresAfterSeconds?: number;
  receivedAt: number;
}

interface State {
  status: string;
  segments: Segment[];
  insights: Insight[];
  agendaItems: AgendaItem[];
  suggestions: Suggestion[];
  rexSpeaking: { text: string; triggeredBy: string; timestamp: number } | null;
  callTitle: string;
  clientName: string;
  engagementName: string;
  startedAt: string | null;
  connected: boolean;
}

type Action =
  | {
      type: "INIT";
      payload: {
        status: string;
        segments: Segment[];
        insights: Insight[];
        agendaItems: AgendaItem[];
        callTitle: string;
        clientName: string;
        engagementName: string;
        startedAt: string | null;
      };
    }
  | { type: "ADD_SEGMENT"; payload: Segment }
  | { type: "ADD_INSIGHT"; payload: Insight }
  | { type: "UPSERT_AGENDA_ITEM"; payload: AgendaItem }
  | { type: "ADD_SUGGESTION"; payload: Suggestion }
  | { type: "EXPIRE_SUGGESTIONS" }
  | { type: "REX_SPEAKING"; payload: { text: string; triggeredBy: string; timestamp: number } }
  | { type: "REX_DONE_SPEAKING" }
  | { type: "SET_STATUS"; payload: string }
  | { type: "SET_CONNECTED"; payload: boolean }
  | { type: "SET_STARTED_AT"; payload: string };

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
        callTitle: action.payload.callTitle,
        clientName: action.payload.clientName,
        engagementName: action.payload.engagementName,
        startedAt: action.payload.startedAt,
        connected: true,
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
      if (state.insights.some((i) => i.id === action.payload.id)) return state;
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
      const updated = [...state.suggestions, action.payload].slice(-5);
      return { ...state, suggestions: updated };
    }
    case "EXPIRE_SUGGESTIONS": {
      const now = Date.now();
      const active = state.suggestions.filter(
        (s) => now - s.receivedAt < (s.expiresAfterSeconds ?? 90) * 1000
      );
      if (active.length === state.suggestions.length) return state;
      return { ...state, suggestions: active };
    }
    case "REX_SPEAKING":
      return { ...state, rexSpeaking: action.payload };
    case "REX_DONE_SPEAKING":
      return { ...state, rexSpeaking: null };
    case "SET_STATUS":
      return { ...state, status: action.payload };
    case "SET_CONNECTED":
      return { ...state, connected: action.payload };
    case "SET_STARTED_AT":
      return { ...state, startedAt: action.payload };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SessionPage({
  params,
}: {
  params: { callId: string };
}) {
  const [state, dispatch] = useReducer(reducer, {
    status: "WAITING",
    segments: [],
    insights: [],
    agendaItems: [],
    suggestions: [],
    rexSpeaking: null,
    callTitle: "",
    clientName: "",
    engagementName: "",
    startedAt: null,
    connected: false,
  });

  const [elapsed, setElapsed] = useState("00:00:00");
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Elapsed timer
  useEffect(() => {
    if (!state.startedAt) return;

    const tick = () => setElapsed(formatElapsed(state.startedAt!));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [state.startedAt]);

  // SSE connection with auto-reconnect
  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource(`/api/stream/${params.callId}`);
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
        dispatch({
          type: "REX_SPEAKING",
          payload: {
            text: data.text,
            triggeredBy: data.triggeredBy,
            timestamp: data.timestamp,
          },
        });
        setTimeout(() => {
          dispatch({ type: "REX_DONE_SPEAKING" });
        }, Math.min(data.text.length * 80, 15000));
      }
    });

    es.addEventListener("status", (e) => {
      const data = JSON.parse(e.data);
      if (data.status) {
        dispatch({ type: "SET_STATUS", payload: data.status });
        if (data.status === "IN_PROGRESS" && !state.startedAt) {
          dispatch({
            type: "SET_STARTED_AT",
            payload: new Date().toISOString(),
          });
        }
      }
    });

    es.onopen = () => {
      dispatch({ type: "SET_CONNECTED", payload: true });
    };

    es.onerror = () => {
      dispatch({ type: "SET_CONNECTED", payload: false });
      es.close();
      reconnectTimeoutRef.current = setTimeout(connect, 3000);
    };
  }, [params.callId, state.startedAt]);

  useEffect(() => {
    connect();
    return () => {
      eventSourceRef.current?.close();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  // Expire stale suggestions every 10s
  useEffect(() => {
    const interval = setInterval(() => {
      dispatch({ type: "EXPIRE_SUGGESTIONS" });
    }, 10_000);
    return () => clearInterval(interval);
  }, []);

  // Determine which view to show
  const hasContent = state.segments.length > 0 || state.insights.length > 0;
  const isCompleted = state.status === "COMPLETED";
  const isLive = state.status === "IN_PROGRESS";

  let view: "intro" | "discovery" | "summary";
  if (isCompleted && hasContent) {
    view = "summary";
  } else if (hasContent || isLive) {
    view = "discovery";
  } else {
    view = "intro";
  }

  return (
    <div className="display-canvas bg-zinc-950 text-zinc-100">
      {view === "intro" && (
        <IntroView
          clientName={state.clientName}
          callTitle={state.callTitle}
          status={state.status}
        />
      )}
      {view === "discovery" && (
        <DiscoveryView
          segments={state.segments}
          insights={state.insights}
          agendaItems={state.agendaItems}
          suggestions={state.suggestions}
          rexSpeaking={state.rexSpeaking}
          elapsed={elapsed}
          clientName={state.clientName}
        />
      )}
      {view === "summary" && (
        <SummaryView
          insights={state.insights}
          segmentCount={state.segments.length}
          elapsed={elapsed}
          clientName={state.clientName}
          callTitle={state.callTitle}
        />
      )}
    </div>
  );
}
