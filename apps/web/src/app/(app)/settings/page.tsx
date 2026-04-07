import { prisma } from "@rex/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConnectHubSpotDialog } from "@/components/connect-hubspot-dialog";
import { PortalActions } from "@/components/portal-actions";

export default async function SettingsPage() {
  let portals: any[] = [];
  try {
    portals = await prisma.hubSpotPortal.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        portalId: true,
        isActive: true,
        lastVerifiedAt: true,
        createdAt: true,
      },
    });
  } catch {
    // DB not connected
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Platform configuration and integrations.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>HubSpot Portals</CardTitle>
            <CardDescription>
              Connect client HubSpot portals using Private App access tokens.
              Tokens are encrypted at rest using AES-256-GCM.
            </CardDescription>
          </div>
          <ConnectHubSpotDialog />
        </CardHeader>
        <CardContent>
          {portals.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No portals connected yet. Add a HubSpot portal to enable
              implementation capabilities.
            </p>
          ) : (
            <div className="space-y-3">
              {portals.map((portal) => (
                <div
                  key={portal.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{portal.name}</span>
                      <Badge
                        variant={portal.isActive ? "success" : "destructive"}
                      >
                        {portal.isActive ? "Connected" : "Inactive"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>Portal ID: {portal.portalId}</span>
                      {portal.lastVerifiedAt && (
                        <span>
                          Verified:{" "}
                          {new Date(portal.lastVerifiedAt).toLocaleDateString(
                            "en-US",
                            { month: "short", day: "numeric", year: "numeric" }
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                  <PortalActions portalId={portal.id} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Slack Integration</CardTitle>
          <CardDescription>
            Configure Slack for internal notifications and client agent.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button disabled variant="outline">
            Configure Slack
          </Button>
          <p className="text-sm text-muted-foreground mt-2">
            Slack integration will be available in Phase 4.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI Configuration</CardTitle>
          <CardDescription>
            API keys and model settings for Claude, OpenAI, Deepgram, and
            ElevenLabs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            AI configuration is managed via environment variables.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
