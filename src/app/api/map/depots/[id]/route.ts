import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const existing = await prisma.mapDepot.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    code?: string;
    country?: string;
    description?: string;
    tenant?: string;
    lat?: number;
    lng?: number;
    featureFlagIds?: string[];
  };

  const depot = await prisma.mapDepot.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.code !== undefined ? { code: body.code.trim().toUpperCase() } : {}),
      ...(body.country !== undefined ? { country: body.country } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.tenant !== undefined ? { tenant: body.tenant.trim().toLowerCase() } : {}),
      ...(typeof body.lat === "number" ? { lat: body.lat } : {}),
      ...(typeof body.lng === "number" ? { lng: body.lng } : {}),
      ...(body.featureFlagIds
        ? { featureFlags: { set: body.featureFlagIds.map((id) => ({ id })) } }
        : {}),
    },
    include: { featureFlags: true },
  });

  return NextResponse.json({ depot });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const existing = await prisma.mapDepot.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.mapDepot.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
