import { NextRequest, NextResponse } from "next/server";
import { prisma, encrypt } from "@rex/shared";

export async function GET() {
  try {
    const connections = await prisma.clickUpConnection.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        listId: true,
        isActive: true,
        lastSyncAt: true,
        createdAt: true,
      },
    });
    return NextResponse.json(connections);
  } catch (err: any) {
    console.error("Failed to list ClickUp connections:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to list connections" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, listId, apiToken } = body || {};

    if (!name || !listId || !apiToken) {
      return NextResponse.json(
        { error: "name, listId, and apiToken are required" },
        { status: 400 }
      );
    }

    const trimmedListId = String(listId).trim();
    if (!/^\d+$/.test(trimmedListId)) {
      return NextResponse.json(
        { error: "listId must be the numeric ClickUp list ID" },
        { status: 400 }
      );
    }

    let encryptedToken: string;
    try {
      encryptedToken = encrypt(apiToken);
    } catch (encErr: any) {
      return NextResponse.json(
        { error: `Encryption failed: ${encErr?.message || "unknown"}` },
        { status: 500 }
      );
    }

    let verified = false;
    try {
      const r = await fetch(
        `https://api.clickup.com/api/v2/list/${trimmedListId}`,
        { headers: { Authorization: apiToken } }
      );
      verified = r.ok;
    } catch {
      // ignore — saved anyway
    }

    const conn = await prisma.clickUpConnection.create({
      data: {
        name,
        listId: trimmedListId,
        apiToken: encryptedToken,
        isActive: verified,
        lastSyncAt: verified ? new Date() : null,
      },
      select: {
        id: true,
        name: true,
        listId: true,
        isActive: true,
        lastSyncAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ ...conn, verified }, { status: 201 });
  } catch (err: any) {
    console.error("Failed to create ClickUp connection:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to create connection" },
      { status: 500 }
    );
  }
}
