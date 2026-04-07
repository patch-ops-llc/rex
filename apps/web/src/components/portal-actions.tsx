"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RefreshCw, Trash2 } from "lucide-react";

export function PortalActions({ portalId }: { portalId: string }) {
  const router = useRouter();
  const [verifying, setVerifying] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleVerify() {
    setVerifying(true);
    try {
      await fetch(`/api/hubspot-portals/${portalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify" }),
      });
      router.refresh();
    } catch {
      // silent
    } finally {
      setVerifying(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Remove this HubSpot portal connection?")) return;
    setDeleting(true);
    try {
      await fetch(`/api/hubspot-portals/${portalId}`, { method: "DELETE" });
      router.refresh();
    } catch {
      setDeleting(false);
    }
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleVerify}
        disabled={verifying}
        className="h-8 w-8 p-0"
        title="Verify connection"
      >
        <RefreshCw
          className={`h-4 w-4 ${verifying ? "animate-spin" : ""}`}
        />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleDelete}
        disabled={deleting}
        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
        title="Remove portal"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
