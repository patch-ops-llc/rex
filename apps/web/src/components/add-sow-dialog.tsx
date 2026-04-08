"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FileText, Plus, Trash2 } from "lucide-react";

interface LineItemDraft {
  workstream: string;
  description: string;
  allocatedHours: string;
  rateTier: string;
  hourlyRate: string;
}

const RATE_TIERS: Record<string, { label: string; rate: number }> = {
  TIER_1: { label: "Tier 1 — Advanced Technical ($100/hr)", rate: 100 },
  TIER_2: { label: "Tier 2 — Intermediate ($85/hr)", rate: 85 },
  TIER_3: { label: "Tier 3 — Standard Config ($75/hr)", rate: 75 },
};

const emptyLineItem = (): LineItemDraft => ({
  workstream: "",
  description: "",
  allocatedHours: "",
  rateTier: "TIER_1",
  hourlyRate: "100",
});

export function AddSOWDialog({ engagementId }: { engagementId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: "",
    startDate: "",
    endDate: "",
    notes: "",
  });
  const [lineItems, setLineItems] = useState<LineItemDraft[]>([emptyLineItem()]);

  function addLineItem() {
    setLineItems((prev) => [...prev, emptyLineItem()]);
  }

  function removeLineItem(idx: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateLineItem(idx: number, field: keyof LineItemDraft, value: string) {
    setLineItems((prev) =>
      prev.map((li, i) => {
        if (i !== idx) return li;
        const updated = { ...li, [field]: value };
        if (field === "rateTier" && RATE_TIERS[value]) {
          updated.hourlyRate = String(RATE_TIERS[value].rate);
        }
        return updated;
      })
    );
  }

  const totalHours = lineItems.reduce(
    (sum, li) => sum + (parseFloat(li.allocatedHours) || 0),
    0
  );
  const totalBudget = lineItems.reduce(
    (sum, li) =>
      sum +
      (parseFloat(li.allocatedHours) || 0) * (parseFloat(li.hourlyRate) || 0),
    0
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const payload = {
        title: form.title,
        totalHours,
        totalBudget,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        notes: form.notes || null,
        lineItems: lineItems
          .filter((li) => li.workstream && li.allocatedHours)
          .map((li) => ({
            workstream: li.workstream,
            description: li.description,
            allocatedHours: parseFloat(li.allocatedHours),
            rateTier: li.rateTier,
            hourlyRate: parseFloat(li.hourlyRate),
          })),
      };

      const res = await fetch(`/api/engagements/${engagementId}/sow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Failed to create SOW");

      setOpen(false);
      setForm({ title: "", startDate: "", endDate: "", notes: "" });
      setLineItems([emptyLineItem()]);
      router.refresh();
    } catch (error) {
      console.error("Failed to create SOW:", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <FileText className="mr-2 h-4 w-4" />
          Add SOW
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Statement of Work</DialogTitle>
            <DialogDescription>
              Define the scope, workstreams, and hour allocations for this
              engagement. Scope alerts will fire automatically as hours are consumed.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="sow-title">SOW Title</Label>
              <Input
                id="sow-title"
                placeholder="e.g. HubSpot Implementation — Phase 1"
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
                required
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="start-date">Start Date</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={form.startDate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, startDate: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="end-date">End Date</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={form.endDate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, endDate: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="sow-notes">Notes</Label>
              <Textarea
                id="sow-notes"
                placeholder="Payment terms, exclusions, special conditions..."
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Workstreams / Line Items</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addLineItem}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Add Workstream
                </Button>
              </div>

              {lineItems.map((li, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border p-3 space-y-3"
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 grid gap-2">
                      <Input
                        placeholder="Workstream name (e.g. Systems Optimization)"
                        value={li.workstream}
                        onChange={(e) =>
                          updateLineItem(idx, "workstream", e.target.value)
                        }
                        required
                      />
                    </div>
                    {lineItems.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeLineItem(idx)}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                  <Input
                    placeholder="Description (optional)"
                    value={li.description}
                    onChange={(e) =>
                      updateLineItem(idx, "description", e.target.value)
                    }
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Hours
                      </Label>
                      <Input
                        type="number"
                        step="0.5"
                        min="0"
                        placeholder="40"
                        value={li.allocatedHours}
                        onChange={(e) =>
                          updateLineItem(idx, "allocatedHours", e.target.value)
                        }
                        required
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Rate Tier
                      </Label>
                      <Select
                        value={li.rateTier}
                        onValueChange={(val) =>
                          updateLineItem(idx, "rateTier", val)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(RATE_TIERS).map(([key, { label }]) => (
                            <SelectItem key={key} value={key}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        $/hr
                      </Label>
                      <Input
                        type="number"
                        step="1"
                        min="0"
                        value={li.hourlyRate}
                        onChange={(e) =>
                          updateLineItem(idx, "hourlyRate", e.target.value)
                        }
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {totalHours > 0 && (
              <div className="rounded-lg bg-muted p-3 flex items-center justify-between text-sm">
                <span className="font-medium">SOW Totals</span>
                <div className="flex gap-6">
                  <span>
                    {totalHours}h allocated
                  </span>
                  <span className="font-semibold">
                    ${totalBudget.toLocaleString()}
                  </span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create SOW"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
