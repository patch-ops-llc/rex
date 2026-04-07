"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";

interface AddDiscoveryDialogProps {
  engagementId: string;
}

export function AddDiscoveryDialog({ engagementId }: AddDiscoveryDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    summary: "",
    notes: "",
    attendees: "",
    meetingDate: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch(`/api/engagements/${engagementId}/discovery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) throw new Error("Failed to create discovery entry");

      setOpen(false);
      setForm({ summary: "", notes: "", attendees: "", meetingDate: "" });
      router.refresh();
    } catch (error) {
      console.error("Failed to create discovery entry:", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Add Discovery Notes
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[525px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Discovery Notes</DialogTitle>
            <DialogDescription>
              Capture requirements, notes, and key takeaways from a discovery
              call or internal review.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="summary">Summary</Label>
              <Input
                id="summary"
                placeholder="Brief summary of the call or session"
                value={form.summary}
                onChange={(e) =>
                  setForm((f) => ({ ...f, summary: e.target.value }))
                }
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notes">Detailed Notes</Label>
              <Textarea
                id="notes"
                placeholder="Requirements, pain points, current systems, integrations needed, etc."
                className="min-h-[150px]"
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="attendees">Attendees</Label>
                <Input
                  id="attendees"
                  placeholder="e.g. Zach, John (CEO), Sarah (VP Sales)"
                  value={form.attendees}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, attendees: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="meetingDate">Meeting Date</Label>
                <Input
                  id="meetingDate"
                  type="date"
                  value={form.meetingDate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, meetingDate: e.target.value }))
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save Discovery Notes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
