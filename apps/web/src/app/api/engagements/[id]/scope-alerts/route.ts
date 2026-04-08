import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const alerts = await prisma.scopeAlert.findMany({
      where: { engagementId: params.id },
      orderBy: [{ status: "asc" }, { severity: "asc" }, { createdAt: "desc" }],
    });
    return NextResponse.json(alerts);
  } catch (error) {
    console.error("Failed to fetch scope alerts:", error);
    return NextResponse.json(
      { error: "Failed to fetch scope alerts" },
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
    const { type, severity, title, description, workstream, hoursImpact, budgetImpact } = body;

    if (!type || !title || !description) {
      return NextResponse.json(
        { error: "type, title, and description are required" },
        { status: 400 }
      );
    }

    const alert = await prisma.scopeAlert.create({
      data: {
        engagementId: params.id,
        type,
        severity: severity || "INFO",
        title,
        description,
        workstream: workstream || null,
        hoursImpact: hoursImpact || null,
        budgetImpact: budgetImpact || null,
      },
    });

    return NextResponse.json(alert, { status: 201 });
  } catch (error) {
    console.error("Failed to create scope alert:", error);
    return NextResponse.json(
      { error: "Failed to create scope alert" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { alertId, status, resolvedBy, resolutionNote } = body;

    if (!alertId) {
      return NextResponse.json(
        { error: "alertId is required" },
        { status: 400 }
      );
    }

    const alert = await prisma.scopeAlert.update({
      where: { id: alertId },
      data: {
        ...(status !== undefined && { status }),
        ...(resolvedBy !== undefined && { resolvedBy }),
        ...(resolutionNote !== undefined && { resolutionNote }),
        ...(status === "RESOLVED" && { resolvedAt: new Date() }),
      },
    });

    return NextResponse.json(alert);
  } catch (error) {
    console.error("Failed to update scope alert:", error);
    return NextResponse.json(
      { error: "Failed to update scope alert" },
      { status: 500 }
    );
  }
}
