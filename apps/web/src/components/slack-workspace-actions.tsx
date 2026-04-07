"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

export function SlackWorkspaceActions({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm("Remove this Slack workspace connection? Rex will lose access to its channels and messages.")) return;
    setDeleting(true);
    try {
      await fetch(`/api/slack/workspaces/${workspaceId}`, { method: "DELETE" });
      router.refresh();
    } catch {
      setDeleting(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleDelete}
      disabled={deleting}
      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
      title="Remove workspace"
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}
