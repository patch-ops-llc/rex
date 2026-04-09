import { NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/google-calendar";

export async function GET() {
  try {
    const url = getAuthUrl();
    return NextResponse.redirect(url);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to initiate Google Calendar auth" },
      { status: 500 }
    );
  }
}
