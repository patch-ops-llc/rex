import { NextRequest, NextResponse } from "next/server";
import { handleCallback } from "@/lib/google-calendar";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(
      new URL("/settings?calendar=error&reason=no_code", request.url)
    );
  }

  try {
    await handleCallback(code);
    return NextResponse.redirect(
      new URL("/settings?calendar=connected", request.url)
    );
  } catch (error: any) {
    console.error("Google Calendar OAuth callback error:", error);
    return NextResponse.redirect(
      new URL(
        `/settings?calendar=error&reason=${encodeURIComponent(error.message)}`,
        request.url
      )
    );
  }
}
