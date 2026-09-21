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

  const existing = await prisma.mapRoute.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
    startPortId?: string;
    endPortId?: string;
    control1Lat?: number;
    control1Lng?: number;
    control2Lat?: number;
    control2Lng?: number;
    featureFlagIds?: string[];
  };

  // A route's start/end are always a real port (never a free lat/lng), so
  // re-pointing either end must reference an existing port.
  if (body.startPortId !== undefined || body.endPortId !== undefined) {
    const [startPort, endPort] = await Promise.all([
      body.startPortId !== undefined
        ? prisma.mapPort.findUnique({ where: { id: body.startPortId } })
        : Promise.resolve(true),
      body.endPortId !== undefined
        ? prisma.mapPort.findUnique({ where: { id: body.endPortId } })
        : Promise.resolve(true),
    ]);
    if (!startPort || !endPort) {
      return NextResponse.json({ error: "startPortId or endPortId does not match an existing port" }, { status: 400 });
    }
  }

  const route = await prisma.mapRoute.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.startPortId !== undefined ? { startPortId: body.startPortId } : {}),
      ...(body.endPortId !== undefined ? { endPortId: body.endPortId } : {}),
      ...(typeof body.control1Lat === "number" ? { control1Lat: body.control1Lat } : {}),
      ...(typeof body.control1Lng === "number" ? { control1Lng: body.control1Lng } : {}),
      ...(typeof body.control2Lat === "number" ? { control2Lat: body.control2Lat } : {}),
      ...(typeof body.control2Lng === "number" ? { control2Lng: body.control2Lng } : {}),
      ...(body.featureFlagIds
        ? { featureFlags: { set: body.featureFlagIds.map((id) => ({ id })) } }
        : {}),
    },
    include: { startPort: true, endPort: true, featureFlags: true },
  });

  return NextResponse.json({ route });
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

  const existing = await prisma.mapRoute.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.mapRoute.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
