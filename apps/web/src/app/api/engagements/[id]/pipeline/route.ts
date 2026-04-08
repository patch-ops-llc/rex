import { NextRequest, NextResponse } from "next/server";
import { pipeline } from "@rex/shared";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const status = await pipeline.getPipelineStatus(params.id);
    return NextResponse.json(status);
  } catch (error) {
    console.error("Failed to get pipeline status:", error);
    return NextResponse.json(
      { error: "Failed to get pipeline status" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { action, phaseType, reason } = body;

    switch (action) {
      case "initialize": {
        const phases = await pipeline.initializePipeline(params.id);
        return NextResponse.json(phases, { status: 201 });
      }
      case "start_phase": {
        if (!phaseType) {
          return NextResponse.json(
            { error: "phaseType is required" },
            { status: 400 }
          );
        }
        const phase = await pipeline.startPhase(params.id, phaseType);
        return NextResponse.json(phase);
      }
      case "complete_phase": {
        if (!phaseType) {
          return NextResponse.json(
            { error: "phaseType is required" },
            { status: 400 }
          );
        }
        const phase = await pipeline.completePhase(params.id, phaseType);
        return NextResponse.json(phase);
      }
      case "skip_phase": {
        if (!phaseType || !reason) {
          return NextResponse.json(
            { error: "phaseType and reason are required" },
            { status: 400 }
          );
        }
        const phase = await pipeline.skipPhase(params.id, phaseType, reason);
        return NextResponse.json(phase);
      }
      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error("Pipeline action failed:", error);
    return NextResponse.json(
      { error: error.message || "Pipeline action failed" },
      { status: 500 }
    );
  }
}
