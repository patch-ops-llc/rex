"use client";

import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export function AddSlackButton({ configured }: { configured: boolean }) {
  if (!configured) return null;

  return (
    <Button asChild>
      <a href="/api/slack/install">
        <Plus className="mr-2 h-4 w-4" />
        Add Workspace
      </a>
    </Button>
  );
}
