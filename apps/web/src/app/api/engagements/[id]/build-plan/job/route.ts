import { NextResponse } from "next/server";
import { getBuildPlanJobStatus } from "@/lib/build-plan-job";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const job = await getBuildPlanJobStatus(params.id);
    return NextResponse.json({ job });
  } catch (error: any) {
    console.error("Failed to fetch build plan job:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch build plan job" },
      { status: 500 },
    );
  }
}
