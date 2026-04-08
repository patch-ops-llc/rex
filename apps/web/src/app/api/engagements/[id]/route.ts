import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const engagement = await prisma.engagement.findUnique({
      where: { id: params.id },
      include: {
        discoveryCalls: { orderBy: { createdAt: "desc" } },
        buildPlan: true,
        implementations: { orderBy: { stepOrder: "asc" } },
        qaItems: { orderBy: { createdAt: "asc" } },
        enablementSessions: true,
        slackMapping: true,
        emailMapping: true,
        hubspotPortal: {
          select: {
            id: true,
            name: true,
            portalId: true,
            isActive: true,
            lastVerifiedAt: true,
          },
        },
        sow: {
          include: {
            lineItems: { orderBy: { displayOrder: "asc" } },
          },
        },
        scopeAlerts: {
          orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        },
        phases: {
          orderBy: { displayOrder: "asc" },
          include: {
            tasks: { orderBy: { displayOrder: "asc" } },
          },
        },
        deliveryLog: {
          orderBy: { createdAt: "desc" },
          take: 50,
        },
        _count: {
          select: {
            conversations: true,
            workRequests: true,
            requirementItems: true,
            uatItems: true,
          },
        },
      },
    });

    if (!engagement) {
      return NextResponse.json(
        { error: "Engagement not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(engagement);
  } catch (error) {
    console.error("Failed to fetch engagement:", error);
    return NextResponse.json(
      { error: "Failed to fetch engagement" },
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
    const { name, clientName, industry, hubspotTier, status, hubspotPortalId } = body;

    if (hubspotPortalId) {
      const portal = await prisma.hubSpotPortal.findUnique({
        where: { id: hubspotPortalId },
      });
      if (!portal) {
        return NextResponse.json(
          { error: "HubSpot portal not found" },
          { status: 404 }
        );
      }
      if (!portal.isActive) {
        return NextResponse.json(
          { error: "HubSpot portal is not active. Verify the connection first." },
          { status: 400 }
        );
      }
    }

    const engagement = await prisma.engagement.update({
      where: { id: params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(clientName !== undefined && { clientName }),
        ...(industry !== undefined && { industry }),
        ...(hubspotTier !== undefined && { hubspotTier }),
        ...(status !== undefined && { status }),
        ...(hubspotPortalId !== undefined && { hubspotPortalId: hubspotPortalId || null }),
      },
      include: {
        hubspotPortal: {
          select: {
            id: true,
            name: true,
            portalId: true,
            isActive: true,
            lastVerifiedAt: true,
          },
        },
      },
    });

    return NextResponse.json(engagement);
  } catch (error) {
    console.error("Failed to update engagement:", error);
    return NextResponse.json(
      { error: "Failed to update engagement" },
      { status: 500 }
    );
  }
}
