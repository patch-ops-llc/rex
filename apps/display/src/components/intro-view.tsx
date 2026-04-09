"use client";

import { Radio } from "lucide-react";

interface IntroViewProps {
  clientName: string;
  callTitle: string;
  status: string;
}

export function IntroView({ clientName, callTitle, status }: IntroViewProps) {
  const isWaiting = status === "WAITING";

  return (
    <div className="flex h-full items-center justify-center bg-zinc-950">
      <div className="flex flex-col items-center gap-6">
        {/* Rex brand */}
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-patchops shadow-lg shadow-patchops/20">
            <span className="text-2xl font-black text-white tracking-tight">R</span>
          </div>
          <div>
            <div className="text-display-lg font-bold text-white tracking-tight">
              Rex
            </div>
            <div className="text-xs font-medium text-zinc-500 tracking-widest uppercase">
              Discovery Agent
            </div>
          </div>
        </div>

        {/* Call info */}
        {(clientName || callTitle) && (
          <div className="text-center">
            {callTitle && (
              <div className="text-lg font-semibold text-zinc-300">
                {callTitle}
              </div>
            )}
            {clientName && (
              <div className="mt-0.5 text-base text-zinc-500">{clientName}</div>
            )}
          </div>
        )}

        {/* Status */}
        <div className="flex items-center gap-2.5 rounded-full border border-zinc-800/60 bg-zinc-900/60 px-5 py-2.5">
          {isWaiting ? (
            <>
              <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse-slow" />
              <span className="text-sm text-zinc-400">
                Waiting to join...
              </span>
            </>
          ) : (
            <>
              <Radio className="h-4 w-4 text-patchops-light animate-pulse-slow" />
              <span className="text-sm text-zinc-400">Listening...</span>
            </>
          )}
        </div>

        {/* Branding */}
        <div className="mt-2 text-xs text-zinc-700">
          Powered by <span className="text-zinc-600">PatchOps</span>
        </div>
      </div>
    </div>
  );
}
