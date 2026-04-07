"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, ChevronDown, ChevronUp } from "lucide-react";

interface CorpusEntryProps {
  entry: {
    id: string;
    name: string;
    tags: string[];
    industry: string | null;
    category: string | null;
    complexity: string | null;
    outcome: string | null;
    source: string | null;
    transcript: any;
    createdAt: string;
  };
}

const categoryLabels: Record<string, string> = {
  "discovery-call": "Discovery Call",
  "implementation-review": "Implementation Review",
  "qa-session": "QA Session",
  "training-session": "Training Session",
  "support-call": "Support Call",
  "internal-notes": "Internal Notes",
  "process-doc": "Process Doc",
  other: "Other",
};

export function CorpusEntryCard({ entry }: CorpusEntryProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm("Delete this corpus entry?")) return;
    setDeleting(true);
    try {
      await fetch(`/api/corpus/${entry.id}`, { method: "DELETE" });
      router.refresh();
    } catch {
      setDeleting(false);
    }
  }

  const transcript = entry.transcript as any;
  const preview =
    transcript?.raw?.slice(0, 200) ||
    transcript?.vtt?.slice(0, 200) ||
    (typeof transcript === "object"
      ? JSON.stringify(transcript).slice(0, 200)
      : String(transcript).slice(0, 200));

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="font-medium truncate">{entry.name}</h3>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            {entry.category && (
              <Badge variant="info">
                {categoryLabels[entry.category] || entry.category}
              </Badge>
            )}
            {entry.industry && (
              <Badge variant="secondary">{entry.industry}</Badge>
            )}
            {entry.complexity && (
              <Badge variant="outline">{entry.complexity}</Badge>
            )}
            {entry.outcome && (
              <Badge
                variant={
                  entry.outcome === "won"
                    ? "success"
                    : entry.outcome === "lost"
                      ? "destructive"
                      : "secondary"
                }
              >
                {entry.outcome}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="h-8 w-8 p-0"
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            disabled={deleting}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {entry.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {entry.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {!expanded && preview && (
        <p className="text-sm text-muted-foreground line-clamp-2">
          {preview}...
        </p>
      )}

      {expanded && (
        <pre className="rounded-lg bg-muted p-4 text-xs overflow-auto max-h-96 whitespace-pre-wrap">
          {transcript?.raw ||
            transcript?.vtt ||
            JSON.stringify(transcript, null, 2)}
        </pre>
      )}

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>
          {new Date(entry.createdAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
        {entry.source && <span>{entry.source}</span>}
      </div>
    </div>
  );
}
