"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export function ConnectHubSpotDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    portalId: "",
    accessToken: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/hubspot-portals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to connect portal");
        return;
      }

      if (!data.verified) {
        setError(
          "Portal saved but token verification failed. Check your access token and try verifying again."
        );
        setTimeout(() => {
          setOpen(false);
          setError("");
          router.refresh();
        }, 3000);
        return;
      }

      setOpen(false);
      setForm({ name: "", portalId: "", accessToken: "" });
      router.refresh();
    } catch (error) {
      setError("Failed to connect portal");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Connect Portal
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[475px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Connect HubSpot Portal</DialogTitle>
            <DialogDescription>
              Add a HubSpot portal using a Private App access token. You can
              connect multiple portals for different clients.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="portal-name">Portal Name</Label>
              <Input
                id="portal-name"
                placeholder="e.g. FlyGuys Production"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="portal-id">Portal ID (Hub ID)</Label>
              <Input
                id="portal-id"
                placeholder="e.g. 12345678"
                value={form.portalId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, portalId: e.target.value }))
                }
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="access-token">Private App Access Token</Label>
              <Input
                id="access-token"
                type="password"
                placeholder="pat-na1-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={form.accessToken}
                onChange={(e) =>
                  setForm((f) => ({ ...f, accessToken: e.target.value }))
                }
                required
              />
              <p className="text-xs text-muted-foreground">
                Create a Private App in HubSpot → Settings → Integrations →
                Private Apps. Token is encrypted at rest.
              </p>
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950 px-4 py-3 text-sm text-red-800 dark:text-red-200 mb-4">
              {error}
            </div>
          )}

          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? "Connecting..." : "Connect Portal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
