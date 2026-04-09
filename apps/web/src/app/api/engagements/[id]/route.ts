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
        hubspotPortals: {
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
    const { name, clientName, industry, hubspotTier, status, addPortalId, removePortalId } = body;

    if (addPortalId) {
      const portal = await prisma.hubSpotPortal.findUnique({
        where: { id: addPortalId },
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

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (clientName !== undefined) data.clientName = clientName;
    if (industry !== undefined) data.industry = industry;
    if (hubspotTier !== undefined) data.hubspotTier = hubspotTier;
    if (status !== undefined) data.status = status;

    if (addPortalId) {
      data.hubspotPortals = { connect: { id: addPortalId } };
    } else if (removePortalId) {
      data.hubspotPortals = { disconnect: { id: removePortalId } };
    }

    const engagement = await prisma.engagement.update({
      where: { id: params.id },
      data,
      include: {
        hubspotPortals: {
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

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const engagement = await prisma.engagement.findUnique({
      where: { id: params.id },
      select: { id: true },
    });

    if (!engagement) {
      return NextResponse.json(
        { error: "Engagement not found" },
        { status: 404 }
      );
    }

    await prisma.$transaction([
      prisma.deliveryLogEntry.deleteMany({ where: { engagementId: params.id } }),
      prisma.scopeAlert.deleteMany({ where: { engagementId: params.id } }),
      prisma.scopeDocument.deleteMany({ where: { engagementId: params.id } }),
      prisma.uATItem.deleteMany({ where: { engagementId: params.id } }),
      prisma.requirementItem.deleteMany({ where: { engagementId: params.id } }),
      prisma.projectTask.deleteMany({ where: { engagementId: params.id } }),
      prisma.projectPhase.deleteMany({ where: { engagementId: params.id } }),
      prisma.workRequest.deleteMany({ where: { engagementId: params.id } }),
      prisma.clientConversation.deleteMany({ where: { engagementId: params.id } }),
      prisma.clientSlackMapping.deleteMany({ where: { engagementId: params.id } }),
      prisma.clientEmailMapping.deleteMany({ where: { engagementId: params.id } }),
      prisma.walkthroughStep.deleteMany({
        where: { walkthrough: { engagementId: params.id } },
      }),
      prisma.walkthrough.deleteMany({ where: { engagementId: params.id } }),
      prisma.enablementSession.deleteMany({ where: { engagementId: params.id } }),
      prisma.qAItem.deleteMany({ where: { engagementId: params.id } }),
      prisma.implementation.deleteMany({ where: { engagementId: params.id } }),
      prisma.buildPlan.deleteMany({ where: { engagementId: params.id } }),
      prisma.sOWLineItem.deleteMany({
        where: { sow: { engagementId: params.id } },
      }),
      prisma.sOW.deleteMany({ where: { engagementId: params.id } }),
      prisma.transcriptSegment.deleteMany({
        where: { discoveryCall: { engagementId: params.id } },
      }),
      prisma.callInsight.deleteMany({
        where: { discoveryCall: { engagementId: params.id } },
      }),
      prisma.discoveryCall.deleteMany({ where: { engagementId: params.id } }),
      prisma.engagement.update({
        where: { id: params.id },
        data: { hubspotPortals: { set: [] } },
      }),
      prisma.engagement.delete({ where: { id: params.id } }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete engagement:", error);
    return NextResponse.json(
      { error: "Failed to delete engagement" },
      { status: 500 }
    );
  }
}
