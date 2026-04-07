import { prisma } from "@rex/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConnectHubSpotDialog } from "@/components/connect-hubspot-dialog";
import { PortalActions } from "@/components/portal-actions";
import { SlackWorkspaceActions } from "@/components/slack-workspace-actions";
import { SlackStatusBanner } from "@/components/slack-status-banner";
import { AddSlackButton } from "@/components/add-slack-button";

export default async function SettingsPage() {
  let portals: any[] = [];
  let slackWorkspaces: any[] = [];

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

  try {
    slackWorkspaces = await prisma.slackWorkspace.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        teamId: true,
        teamName: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  } catch {
    // DB not connected
  }

  const slackConfigured = !!(process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Platform configuration and integrations.
        </p>
      </div>

      <SlackStatusBanner />

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
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>Slack Workspaces</CardTitle>
            <CardDescription>
              Connect Slack workspaces via OAuth to give Rex access to channels and messages.
              Rex can read, search, and send messages during chat conversations.
            </CardDescription>
          </div>
          <AddSlackButton configured={slackConfigured} />
        </CardHeader>
        <CardContent>
          {!slackConfigured ? (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <p className="text-sm text-muted-foreground">
                Set <code className="text-xs bg-muted px-1.5 py-0.5 rounded">SLACK_CLIENT_ID</code> and{" "}
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">SLACK_CLIENT_SECRET</code> environment
                variables to enable Slack OAuth.
              </p>
            </div>
          ) : slackWorkspaces.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No Slack workspaces connected yet. Add a workspace to let Rex read and interact with Slack.
            </p>
          ) : (
            <div className="space-y-3">
              {slackWorkspaces.map((ws) => (
                <div
                  key={ws.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.124 2.521a2.528 2.528 0 0 1 2.52-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.52V8.834zm-1.271 0a2.528 2.528 0 0 1-2.521 2.521 2.528 2.528 0 0 1-2.521-2.521V2.522A2.528 2.528 0 0 1 15.165 0a2.528 2.528 0 0 1 2.522 2.522v6.312zm-2.522 10.124a2.528 2.528 0 0 1 2.522 2.52A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.521-2.522v-2.52h2.521zm0-1.271a2.527 2.527 0 0 1-2.521-2.521 2.528 2.528 0 0 1 2.521-2.521h6.313A2.528 2.528 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.522h-6.313z"/>
                      </svg>
                      <span className="font-medium">{ws.teamName}</span>
                      <Badge
                        variant={ws.isActive ? "success" : "destructive"}
                      >
                        {ws.isActive ? "Connected" : "Inactive"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>Team ID: {ws.teamId}</span>
                      <span>
                        Added:{" "}
                        {new Date(ws.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                  </div>
                  <SlackWorkspaceActions workspaceId={ws.id} />
                </div>
              ))}
            </div>
          )}
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
