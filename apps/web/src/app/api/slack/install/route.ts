import { NextRequest, NextResponse } from "next/server";
import { SLACK_OAUTH_SCOPES } from "@/lib/slack";
import crypto from "crypto";

export async function GET(request: NextRequest) {
  const clientId = process.env.SLACK_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "SLACK_CLIENT_ID is not configured" },
      { status: 500 }
    );
  }

  const baseUrl = process.env.WEB_URL || request.nextUrl.origin;
  const redirectUri = `${baseUrl}/api/slack/callback`;
  const state = crypto.randomBytes(16).toString("hex");

  const response = NextResponse.redirect(
    `https://slack.com/oauth/v2/authorize?` +
      `client_id=${clientId}` +
      `&scope=${encodeURIComponent(SLACK_OAUTH_SCOPES)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${state}`
  );

  response.cookies.set("slack_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
