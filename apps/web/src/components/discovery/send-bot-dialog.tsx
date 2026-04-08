"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Radio, Loader2, ExternalLink } from "lucide-react";

interface SendBotDialogProps {
  engagementId: string;
  clientName: string;
}

export function SendBotDialog({ engagementId, clientName }: SendBotDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [meetingUrl, setMeetingUrl] = useState("");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    discoveryCall: { id: string };
    liveUrl: string;
  } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/engagements/${engagementId}/discovery/bot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meetingUrl,
          title: title || `${clientName} Discovery`,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to send Rex to the meeting");
        return;
      }

      setResult(data);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function handleGoLive() {
    if (result) {
      router.push(result.liveUrl);
      setOpen(false);
    }
  }

  function handleReset() {
    setMeetingUrl("");
    setTitle("");
    setError(null);
    setResult(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) handleReset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Radio className="h-3.5 w-3.5" />
          Send Rex to Call
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send Rex to a Meeting</DialogTitle>
          <DialogDescription>
            Rex will join the call, transcribe the conversation in real-time, and
            extract requirements, decisions, and action items automatically.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="meetingUrl">Meeting URL</Label>
              <Input
                id="meetingUrl"
                placeholder="https://zoom.us/j/... or meet.google.com/..."
                value={meetingUrl}
                onChange={(e) => setMeetingUrl(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Supports Zoom, Google Meet, and Microsoft Teams
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Call Title (optional)</Label>
              <Input
                id="title"
                placeholder={`${clientName} Discovery`}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading || !meetingUrl}>
                {loading ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Dispatching...
                  </>
                ) : (
                  "Send Rex"
                )}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-800 bg-emerald-950/50 p-4">
              <p className="text-sm font-medium text-emerald-400">
                Rex has been dispatched to the meeting
              </p>
              <p className="mt-1 text-xs text-emerald-400/70">
                Rex is joining the call. Open the live dashboard to see
                real-time transcript and insights.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Close
              </Button>
              <Button onClick={handleGoLive} className="gap-1.5">
                <ExternalLink className="h-3.5 w-3.5" />
                Open Live Dashboard
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
