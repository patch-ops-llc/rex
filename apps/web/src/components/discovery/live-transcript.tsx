"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

interface Segment {
  id: string;
  speaker: string;
  text: string;
  startTime: number;
  endTime: number;
  isFinal: boolean;
}

interface LiveTranscriptProps {
  segments: Segment[];
}

const SPEAKER_COLORS: Record<string, string> = {};
const COLOR_PALETTE = [
  "text-blue-400",
  "text-emerald-400",
  "text-amber-400",
  "text-purple-400",
  "text-rose-400",
  "text-cyan-400",
  "text-orange-400",
  "text-lime-400",
];

function getSpeakerColor(speaker: string): string {
  if (!SPEAKER_COLORS[speaker]) {
    const idx = Object.keys(SPEAKER_COLORS).length % COLOR_PALETTE.length;
    SPEAKER_COLORS[speaker] = COLOR_PALETTE[idx];
  }
  return SPEAKER_COLORS[speaker];
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function LiveTranscript({ segments }: LiveTranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const prevCountRef = useRef(0);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setAutoScroll(atBottom);
  }, []);

  useEffect(() => {
    if (autoScroll && segments.length > prevCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevCountRef.current = segments.length;
  }, [segments.length, autoScroll]);

  // Group consecutive segments by speaker
  const groups: Array<{
    speaker: string;
    startTime: number;
    entries: Segment[];
  }> = [];

  for (const seg of segments) {
    const last = groups[groups.length - 1];
    if (last && last.speaker === seg.speaker) {
      last.entries.push(seg);
    } else {
      groups.push({
        speaker: seg.speaker,
        startTime: seg.startTime,
        entries: [seg],
      });
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Transcript
        </h2>
        {!autoScroll && segments.length > 0 && (
          <button
            onClick={() => {
              setAutoScroll(true);
              bottomRef.current?.scrollIntoView({ behavior: "smooth" });
            }}
            className="rounded bg-[#0e2799] px-2 py-0.5 text-xs font-medium text-white transition hover:bg-[#0e2799]/80"
          >
            Jump to latest
          </button>
        )}
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-3"
      >
        {segments.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-zinc-600">
              Waiting for transcript...
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((group, gi) => {
              const color = getSpeakerColor(group.speaker);
              return (
                <div key={gi} className="group animate-in fade-in slide-in-from-bottom-1 duration-300">
                  <div className="mb-0.5 flex items-center gap-2">
                    <span
                      className={cn("text-xs font-semibold", color)}
                    >
                      {group.speaker}
                    </span>
                    <span className="text-[10px] text-zinc-600">
                      {formatTimestamp(group.startTime)}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-zinc-300">
                    {group.entries.map((e) => e.text).join(" ")}
                  </p>
                </div>
              );
            })}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
