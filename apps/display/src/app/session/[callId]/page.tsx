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

interface State {
  status: string;
  segments: Segment[];
  insights: Insight[];
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
        callTitle: string;
        clientName: string;
        engagementName: string;
        startedAt: string | null;
      };
    }
  | { type: "ADD_SEGMENT"; payload: Segment }
  | { type: "ADD_INSIGHT"; payload: Insight }
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
        callTitle: action.payload.callTitle,
        clientName: action.payload.clientName,
        engagementName: action.payload.engagementName,
        startedAt: action.payload.startedAt,
        connected: true,
      };
    case "ADD_SEGMENT": {
      if (state.segments.some((s) => s.id === action.payload.id)) return state;
      return { ...state, segments: [...state.segments, action.payload] };
    }
    case "ADD_INSIGHT": {
      if (state.insights.some((i) => i.id === action.payload.id)) return state;
      return { ...state, insights: [...state.insights, action.payload] };
    }
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
