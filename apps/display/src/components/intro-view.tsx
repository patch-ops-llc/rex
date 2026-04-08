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
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-8">
        {/* PatchOps brand mark */}
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-patchops">
            <span className="text-2xl font-black text-white tracking-tight">R</span>
          </div>
          <div>
            <div className="text-display-lg font-bold text-white tracking-tight">
              REX
            </div>
            <div className="text-sm font-medium text-zinc-500 tracking-wider uppercase">
              Discovery Agent
            </div>
          </div>
        </div>

        {/* Call info */}
        {(clientName || callTitle) && (
          <div className="text-center">
            {callTitle && (
              <div className="text-xl font-semibold text-zinc-200">
                {callTitle}
              </div>
            )}
            {clientName && (
              <div className="mt-1 text-lg text-zinc-500">{clientName}</div>
            )}
          </div>
        )}

        {/* Status indicator */}
        <div className="flex items-center gap-3 rounded-full border border-zinc-800 bg-zinc-900/80 px-6 py-3">
          {isWaiting ? (
            <>
              <div className="h-2.5 w-2.5 rounded-full bg-amber-400 animate-pulse-slow" />
              <span className="text-lg text-zinc-300">
                Waiting to join meeting...
              </span>
            </>
          ) : (
            <>
              <Radio className="h-5 w-5 text-patchops-light animate-pulse-slow" />
              <span className="text-lg text-zinc-300">Listening...</span>
            </>
          )}
        </div>

        {/* Branding */}
        <div className="mt-4 text-sm text-zinc-700">
          Powered by <span className="text-zinc-500">PatchOps</span>
        </div>
      </div>
    </div>
  );
}
