export default function DisplayHome() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-6">
        <div className="flex items-center justify-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-patchops">
            <span className="text-2xl font-black text-white tracking-tight">R</span>
          </div>
        </div>
        <div>
          <h1 className="text-4xl font-bold tracking-tight">REX Display</h1>
          <p className="mt-2 text-lg text-zinc-500">
            Live call copilot — visual output rendered as in-meeting screen share.
          </p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-6 py-4 text-left max-w-md mx-auto">
          <p className="text-sm text-zinc-400 mb-3">
            Session URLs follow this format:
          </p>
          <code className="text-sm text-patchops-light">
            /session/&#123;callId&#125;
          </code>
          <p className="mt-3 text-xs text-zinc-600">
            Recall.ai bots are configured to load session pages as their
            display output during live discovery calls.
          </p>
        </div>
      </div>
    </div>
  );
}
