"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  Check,
  ExternalLink,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Unlink,
} from "lucide-react";

interface PortalInfo {
  id: string;
  name: string;
  portalId: string;
  isActive: boolean;
  lastVerifiedAt: string | null;
}

interface HubSpotConnectionCardProps {
  engagementId: string;
  linkedPortal: PortalInfo | null;
}

export function HubSpotConnectionCard({
  engagementId,
  linkedPortal,
}: HubSpotConnectionCardProps) {
  const router = useRouter();
  const [availablePortals, setAvailablePortals] = useState<PortalInfo[]>([]);
  const [loadingPortals, setLoadingPortals] = useState(false);
  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [showSelector, setShowSelector] = useState(false);
  const [selectedPortalId, setSelectedPortalId] = useState("");
  const [showNewPortal, setShowNewPortal] = useState(false);
  const [newPortalForm, setNewPortalForm] = useState({
    name: "",
    portalId: "",
    accessToken: "",
  });
  const [newPortalError, setNewPortalError] = useState("");
  const [newPortalLoading, setNewPortalLoading] = useState(false);

  useEffect(() => {
    if (showSelector) {
      loadPortals();
    }
  }, [showSelector]);

  async function loadPortals() {
    setLoadingPortals(true);
    try {
      const res = await fetch("/api/hubspot-portals");
      if (res.ok) {
        const portals = await res.json();
        setAvailablePortals(portals.filter((p: PortalInfo) => p.isActive));
      }
    } catch {
      // silent
    } finally {
      setLoadingPortals(false);
    }
  }

  async function linkPortal(portalId: string) {
    setLinking(true);
    try {
      const res = await fetch(`/api/engagements/${engagementId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hubspotPortalId: portalId }),
      });
      if (res.ok) {
        setShowSelector(false);
        setSelectedPortalId("");
        router.refresh();
      }
    } catch {
      // silent
    } finally {
      setLinking(false);
    }
  }

  async function unlinkPortal() {
    setUnlinking(true);
    try {
      const res = await fetch(`/api/engagements/${engagementId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hubspotPortalId: "" }),
      });
      if (res.ok) {
        router.refresh();
      }
    } catch {
      // silent
    } finally {
      setUnlinking(false);
    }
  }

  async function verifyPortal() {
    if (!linkedPortal) return;
    setVerifying(true);
    try {
      await fetch(`/api/hubspot-portals/${linkedPortal.id}`, {
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

  async function handleNewPortalSubmit(e: React.FormEvent) {
    e.preventDefault();
    setNewPortalLoading(true);
    setNewPortalError("");

    try {
      const res = await fetch("/api/hubspot-portals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newPortalForm),
      });

      const data = await res.json();

      if (!res.ok) {
        setNewPortalError(data.error || "Failed to connect portal");
        return;
      }

      if (!data.verified) {
        setNewPortalError(
          "Portal saved but token verification failed. Check your access token."
        );
        return;
      }

      await linkPortal(data.id);
      setShowNewPortal(false);
      setNewPortalForm({ name: "", portalId: "", accessToken: "" });
    } catch {
      setNewPortalError("Failed to connect portal");
    } finally {
      setNewPortalLoading(false);
    }
  }

  if (linkedPortal) {
    return (
      <Card
        className={
          linkedPortal.isActive
            ? "border-green-200 dark:border-green-900"
            : "border-amber-200 dark:border-amber-900"
        }
      >
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`h-9 w-9 rounded-lg flex items-center justify-center ${
                  linkedPortal.isActive
                    ? "bg-green-100 dark:bg-green-900/50"
                    : "bg-amber-100 dark:bg-amber-900/50"
                }`}
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M22.08 1.92H1.92C.86 1.92 0 2.78 0 3.84v16.32C0 21.22.86 22.08 1.92 22.08h20.16c1.06 0 1.92-.86 1.92-1.92V3.84c0-1.06-.86-1.92-1.92-1.92zM7.68 18.24H3.84v-3.84h3.84v3.84zm0-5.76H3.84V8.64h3.84v3.84zm5.76 5.76H9.6v-3.84h3.84v3.84zm0-5.76H9.6V8.64h3.84v3.84zm5.76 5.76h-3.84v-3.84h3.84v3.84zm0-5.76h-3.84V8.64h3.84v3.84z" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {linkedPortal.name}
                  </span>
                  <Badge
                    variant={linkedPortal.isActive ? "success" : "warning"}
                    className="text-[10px]"
                  >
                    {linkedPortal.isActive ? "Connected" : "Needs Verification"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Portal ID: {linkedPortal.portalId}
                  {linkedPortal.lastVerifiedAt &&
                    ` · Verified ${new Date(linkedPortal.lastVerifiedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {!linkedPortal.isActive && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={verifyPortal}
                  disabled={verifying}
                  className="h-8"
                >
                  <RefreshCw
                    className={`mr-1.5 h-3 w-3 ${verifying ? "animate-spin" : ""}`}
                  />
                  Verify
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={unlinkPortal}
                disabled={unlinking}
                className="h-8 text-muted-foreground hover:text-destructive"
                title="Unlink portal"
              >
                {unlinking ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Unlink className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-dashed border-amber-300 dark:border-amber-800">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-medium">No HubSpot Portal Connected</p>
              <p className="text-xs text-muted-foreground">
                Link a portal to enable REX to build in the client&apos;s
                HubSpot account.
              </p>
            </div>
          </div>

          {!showSelector ? (
            <Button
              size="sm"
              onClick={() => setShowSelector(true)}
              className="h-8"
            >
              <Link2 className="mr-1.5 h-3.5 w-3.5" />
              Connect Portal
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              {loadingPortals ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : availablePortals.length > 0 ? (
                <>
                  <Select
                    value={selectedPortalId}
                    onValueChange={setSelectedPortalId}
                  >
                    <SelectTrigger className="h-8 w-[200px] text-xs">
                      <SelectValue placeholder="Select a portal..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availablePortals.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} ({p.portalId})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    onClick={() => linkPortal(selectedPortalId)}
                    disabled={!selectedPortalId || linking}
                    className="h-8"
                  >
                    {linking ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </>
              ) : null}

              <Dialog open={showNewPortal} onOpenChange={setShowNewPortal}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8">
                    <Plus className="mr-1 h-3 w-3" />
                    New
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[475px]">
                  <form onSubmit={handleNewPortalSubmit}>
                    <DialogHeader>
                      <DialogTitle>Connect New HubSpot Portal</DialogTitle>
                      <DialogDescription>
                        Add the client&apos;s HubSpot portal using a Private App
                        access token. The token will be encrypted at rest and
                        linked to this engagement.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label htmlFor="new-portal-name">Portal Name</Label>
                        <Input
                          id="new-portal-name"
                          placeholder="e.g. Acme Corp Production"
                          value={newPortalForm.name}
                          onChange={(e) =>
                            setNewPortalForm((f) => ({
                              ...f,
                              name: e.target.value,
                            }))
                          }
                          required
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="new-portal-id">
                          Portal ID (Hub ID)
                        </Label>
                        <Input
                          id="new-portal-id"
                          placeholder="e.g. 12345678"
                          value={newPortalForm.portalId}
                          onChange={(e) =>
                            setNewPortalForm((f) => ({
                              ...f,
                              portalId: e.target.value,
                            }))
                          }
                          required
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="new-access-token">
                          Private App Access Token
                        </Label>
                        <Input
                          id="new-access-token"
                          type="password"
                          placeholder="pat-na1-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                          value={newPortalForm.accessToken}
                          onChange={(e) =>
                            setNewPortalForm((f) => ({
                              ...f,
                              accessToken: e.target.value,
                            }))
                          }
                          required
                        />
                        <p className="text-xs text-muted-foreground">
                          Ask the client to create a Private App in HubSpot
                          &rarr; Settings &rarr; Integrations &rarr; Private
                          Apps with CRM read/write scopes. Token is encrypted at
                          rest.
                        </p>
                      </div>

                      <div className="rounded-lg bg-muted px-4 py-3">
                        <p className="text-xs font-medium mb-1">
                          Required Private App Scopes:
                        </p>
                        <ul className="text-xs text-muted-foreground space-y-0.5">
                          <li>
                            <code className="bg-background px-1 rounded text-[10px]">
                              crm.objects.contacts
                            </code>{" "}
                            — read/write
                          </li>
                          <li>
                            <code className="bg-background px-1 rounded text-[10px]">
                              crm.objects.companies
                            </code>{" "}
                            — read/write
                          </li>
                          <li>
                            <code className="bg-background px-1 rounded text-[10px]">
                              crm.objects.deals
                            </code>{" "}
                            — read/write
                          </li>
                          <li>
                            <code className="bg-background px-1 rounded text-[10px]">
                              crm.schemas.custom.read/write
                            </code>{" "}
                            — for custom objects
                          </li>
                          <li>
                            <code className="bg-background px-1 rounded text-[10px]">
                              settings.users.read
                            </code>{" "}
                            — for owner mapping
                          </li>
                          <li>
                            <code className="bg-background px-1 rounded text-[10px]">
                              automation
                            </code>{" "}
                            — for workflows
                          </li>
                        </ul>
                      </div>
                    </div>

                    {newPortalError && (
                      <div className="rounded-lg bg-red-50 dark:bg-red-950 px-4 py-3 text-sm text-red-800 dark:text-red-200 mb-4">
                        {newPortalError}
                      </div>
                    )}

                    <DialogFooter>
                      <Button type="submit" disabled={newPortalLoading}>
                        {newPortalLoading
                          ? "Connecting..."
                          : "Connect & Link Portal"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowSelector(false);
                  setSelectedPortalId("");
                }}
                className="h-8 text-xs"
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
