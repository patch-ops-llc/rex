import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Platform configuration and integrations.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>HubSpot Connection</CardTitle>
          <CardDescription>
            Connect your HubSpot portal to enable implementation capabilities.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button disabled>Connect HubSpot</Button>
          <p className="text-sm text-muted-foreground mt-2">
            OAuth flow will be available in Phase 2.
          </p>
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
