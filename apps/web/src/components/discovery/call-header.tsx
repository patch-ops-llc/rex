"use client";

import { useState, useEffect } from "react";
import {
  Radio,
  Clock,
  Users,
  Maximize,
  Minimize,
  Wifi,
  WifiOff,
  Square,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CallHeaderProps {
  engagementName: string;
  clientName: string;
  callTitle: string;
  status: string;
  startedAt: string | null;
  speakerCount: number;
  connected: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onEndSession?: () => Promise<void>;
}

export function CallHeader({
  engagementName,
  clientName,
  callTitle,
  status,
  startedAt,
  speakerCount,
  connected,
  isFullscreen,
  onToggleFullscreen,
  onEndSession,
}: CallHeaderProps) {
  const [elapsed, setElapsed] = useState("00:00:00");

  useEffect(() => {
    if (!startedAt || status === "COMPLETED") return;

    const start = new Date(startedAt).getTime();
    const tick = () => {
      const diff = Math.max(0, Math.floor((Date.now() - start) / 1000));
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setElapsed(
        `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
      );
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startedAt, status]);

  const [stopping, setStopping] = useState(false);
  const isLive = status === "IN_PROGRESS";
  const canEnd = isLive || status === "WAITING";

  async function handleEnd() {
    if (!onEndSession || stopping) return;
    setStopping(true);
    try {
      await onEndSession();
    } finally {
      setStopping(false);
    }
  }

  return (
    <header className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950 px-6 py-3">
      <div className="flex items-center gap-4">
        {isLive && (
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-red-400">
              Live
            </span>
          </div>
        )}
        {status === "COMPLETED" && (
          <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-400">
            Ended
          </span>
        )}
        {status === "WAITING" && (
          <span className="rounded bg-yellow-900/50 px-2 py-0.5 text-xs font-medium text-yellow-400">
            Waiting to join...
          </span>
        )}
        <div>
          <h1 className="text-sm font-semibold text-zinc-100">{callTitle}</h1>
          <p className="text-xs text-zinc-500">
            {clientName} &middot; {engagementName}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-5">
        <div className="flex items-center gap-1.5 text-zinc-400">
          <Clock className="h-3.5 w-3.5" />
          <span className="font-mono text-sm">{elapsed}</span>
        </div>

        <div className="flex items-center gap-1.5 text-zinc-400">
          <Users className="h-3.5 w-3.5" />
          <span className="text-sm">{speakerCount}</span>
        </div>

        <div
          className={cn(
            "flex items-center gap-1.5 text-xs",
            connected ? "text-emerald-400" : "text-red-400"
          )}
        >
          {connected ? (
            <Wifi className="h-3.5 w-3.5" />
          ) : (
            <WifiOff className="h-3.5 w-3.5" />
          )}
          <span>{connected ? "Connected" : "Reconnecting..."}</span>
        </div>

        {canEnd && onEndSession && (
          <button
            onClick={handleEnd}
            disabled={stopping}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition",
              stopping
                ? "bg-zinc-800 text-zinc-500"
                : "bg-red-600 text-white hover:bg-red-700"
            )}
          >
            {stopping ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Square className="h-3 w-3 fill-current" />
            )}
            {stopping ? "Ending..." : "End Session"}
          </button>
        )}

        <button
          onClick={onToggleFullscreen}
          className="rounded p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
        >
          {isFullscreen ? (
            <Minimize className="h-4 w-4" />
          ) : (
            <Maximize className="h-4 w-4" />
          )}
        </button>
      </div>
    </header>
  );
}
