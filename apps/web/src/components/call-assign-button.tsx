"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CallAssignButtonProps {
  callId: string;
  engagements: Array<{ id: string; label: string }>;
}

export function CallAssignButton({ callId, engagements }: CallAssignButtonProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<string>("");
  const [assigning, setAssigning] = useState(false);
  const [showSelect, setShowSelect] = useState(false);

  async function handleAssign() {
    if (!selected) return;
    setAssigning(true);
    try {
      const res = await fetch(`/api/calls/${callId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engagementId: selected }),
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setAssigning(false);
    }
  }

  if (!showSelect) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={() => setShowSelect(true)}
      >
        <LinkIcon className="h-3 w-3 mr-1" />
        Assign
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Select value={selected} onValueChange={setSelected}>
        <SelectTrigger className="h-7 w-48 text-xs">
          <SelectValue placeholder="Select engagement" />
        </SelectTrigger>
        <SelectContent>
          {engagements.map((eng) => (
            <SelectItem key={eng.id} value={eng.id} className="text-xs">
              {eng.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        className="h-7 text-xs"
        disabled={!selected || assigning}
        onClick={handleAssign}
      >
        {assigning ? "..." : "Save"}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs"
        onClick={() => setShowSelect(false)}
      >
        Cancel
      </Button>
    </div>
  );
}
