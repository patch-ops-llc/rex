import { NextRequest, NextResponse } from "next/server";
import { prisma, decrypt, encrypt } from "@rex/shared";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.hubSpotPortal.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Failed to delete HubSpot portal:", error);
    return NextResponse.json(
      { error: "Failed to delete portal" },
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

    if (body.action === "verify") {
      const portal = await prisma.hubSpotPortal.findUnique({
        where: { id: params.id },
      });

      if (!portal) {
        return NextResponse.json(
          { error: "Portal not found" },
          { status: 404 }
        );
      }

      const token = decrypt(portal.accessToken);
      const res = await fetch(
        "https://api.hubapi.com/account-info/v3/details",
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const isActive = res.ok;
      const updated = await prisma.hubSpotPortal.update({
        where: { id: params.id },
        data: {
          isActive,
          lastVerifiedAt: isActive ? new Date() : portal.lastVerifiedAt,
        },
        select: {
          id: true,
          name: true,
          portalId: true,
          isActive: true,
          lastVerifiedAt: true,
        },
      });

      return NextResponse.json(updated);
    }

    const { name, accessToken } = body;
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (accessToken !== undefined) data.accessToken = encrypt(accessToken);

    const updated = await prisma.hubSpotPortal.update({
      where: { id: params.id },
      data,
      select: {
        id: true,
        name: true,
        portalId: true,
        isActive: true,
        lastVerifiedAt: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update HubSpot portal:", error);
    return NextResponse.json(
      { error: "Failed to update portal" },
      { status: 500 }
    );
  }
}
