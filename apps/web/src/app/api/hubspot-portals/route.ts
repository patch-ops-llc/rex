import { NextRequest, NextResponse } from "next/server";
import { prisma, encrypt } from "@rex/shared";

export async function GET() {
  try {
    const portals = await prisma.hubSpotPortal.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        portalId: true,
        isActive: true,
        lastVerifiedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(portals);
  } catch (error) {
    console.error("Failed to fetch HubSpot portals:", error);
    return NextResponse.json(
      { error: "Failed to fetch portals" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, portalId, accessToken } = body;

    if (!name || !portalId || !accessToken) {
      return NextResponse.json(
        { error: "name, portalId, and accessToken are required" },
        { status: 400 }
      );
    }

    const trimmedPortalId = String(portalId).trim();
    if (!/^\d+$/.test(trimmedPortalId)) {
      return NextResponse.json(
        { error: "Portal ID must be a numeric Hub ID (e.g. 12345678)" },
        { status: 400 }
      );
    }

    let encryptedToken: string;
    try {
      encryptedToken = encrypt(accessToken);
    } catch (encErr) {
      const detail = encErr instanceof Error ? encErr.message : "Encryption failed";
      console.error("Token encryption failed:", detail);
      return NextResponse.json(
        { error: `Server configuration error: ${detail}` },
        { status: 500 }
      );
    }

    let verified = false;
    let verifiedAt: Date | null = null;
    try {
      const res = await fetch(
        "https://api.hubapi.com/account-info/v3/details",
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      if (res.ok) {
        verified = true;
        verifiedAt = new Date();
      }
    } catch {
      // verification failed but we still store — user can retry
    }

    const portal = await prisma.hubSpotPortal.create({
      data: {
        name,
        portalId: trimmedPortalId,
        accessToken: encryptedToken,
        isActive: verified,
        lastVerifiedAt: verifiedAt,
      },
      select: {
        id: true,
        name: true,
        portalId: true,
        isActive: true,
        lastVerifiedAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      { ...portal, verified },
      { status: 201 }
    );
  } catch (error: any) {
    if (error?.code === "P2002") {
      return NextResponse.json(
        { error: "A portal with this ID already exists" },
        { status: 409 }
      );
    }
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to create HubSpot portal:", detail, error);
    return NextResponse.json(
      { error: `Failed to create portal: ${detail}` },
      { status: 500 }
    );
  }
}
