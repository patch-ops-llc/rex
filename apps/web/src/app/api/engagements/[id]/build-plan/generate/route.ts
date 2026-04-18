import { NextRequest, NextResponse } from "next/server";
import { startBuildPlanJob } from "@/lib/build-plan-job";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const job = await startBuildPlanJob(params.id);
    return NextResponse.json({ job }, { status: 202 });
  } catch (error: any) {
    if (error.message === "Engagement not found") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (
      error.message ===
      "No completed discovery calls. Complete at least one discovery session first."
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Failed to queue build plan generation:", error);
    return NextResponse.json(
      { error: error.message || "Failed to start build plan generation job" },
      { status: 500 }
    );
  }
}
