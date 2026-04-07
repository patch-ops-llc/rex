import { NextRequest, NextResponse } from "next/server";
import { prisma, encrypt } from "@rex/shared";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const baseUrl = process.env.WEB_URL || request.nextUrl.origin;

  if (error) {
    return NextResponse.redirect(
      `${baseUrl}/settings?slack_error=${encodeURIComponent(error)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${baseUrl}/settings?slack_error=${encodeURIComponent("No authorization code received")}`
    );
  }

  const savedState = request.cookies.get("slack_oauth_state")?.value;
  if (!savedState || savedState !== state) {
    return NextResponse.redirect(
      `${baseUrl}/settings?slack_error=${encodeURIComponent("Invalid OAuth state — possible CSRF. Try again.")}`
    );
  }

  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      `${baseUrl}/settings?slack_error=${encodeURIComponent("Slack OAuth credentials not configured")}`
    );
  }

  const redirectUri = `${baseUrl}/api/slack/callback`;

  try {
    const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenData.ok) {
      return NextResponse.redirect(
        `${baseUrl}/settings?slack_error=${encodeURIComponent(tokenData.error || "OAuth token exchange failed")}`
      );
    }

    const {
      access_token,
      team,
      bot_user_id,
      scope,
      authed_user,
    } = tokenData;

    const encryptedToken = encrypt(access_token);

    await prisma.slackWorkspace.upsert({
      where: { teamId: team.id },
      create: {
        teamId: team.id,
        teamName: team.name,
        accessToken: encryptedToken,
        botUserId: bot_user_id,
        scope: scope,
        installedBy: authed_user?.id,
        isActive: true,
      },
      update: {
        teamName: team.name,
        accessToken: encryptedToken,
        botUserId: bot_user_id,
        scope: scope,
        installedBy: authed_user?.id,
        isActive: true,
        updatedAt: new Date(),
      },
    });

    const response = NextResponse.redirect(
      `${baseUrl}/settings?slack_success=${encodeURIComponent(team.name)}`
    );
    response.cookies.delete("slack_oauth_state");
    return response;
  } catch (err) {
    console.error("Slack OAuth callback error:", err);
    return NextResponse.redirect(
      `${baseUrl}/settings?slack_error=${encodeURIComponent("Failed to complete Slack OAuth")}`
    );
  }
}
