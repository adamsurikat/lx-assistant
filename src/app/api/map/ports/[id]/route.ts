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

  const existing = await prisma.mapPort.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    code?: string;
    tenant?: string;
    country?: string;
    description?: string;
    lat?: number;
    lng?: number;
    featureFlagNames?: string[];
  };

  const port = await prisma.mapPort.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.code !== undefined ? { code: body.code } : {}),
      ...(body.tenant !== undefined ? { tenant: body.tenant.trim().toLowerCase() } : {}),
      ...(body.country !== undefined ? { country: body.country } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(typeof body.lat === "number" ? { lat: body.lat } : {}),
      ...(typeof body.lng === "number" ? { lng: body.lng } : {}),
      // The caller always sends the complete desired set of flag names, so
      // drop every existing row and recreate it rather than diffing —
      // there's no shared flag identity to preserve across the swap.
      ...(body.featureFlagNames
        ? {
            featureFlags: {
              deleteMany: {},
              create: body.featureFlagNames.map((name) => ({ name })),
            },
          }
        : {}),
    },
    include: { featureFlags: true },
  });

  return NextResponse.json({ port });
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

  const existing = await prisma.mapPort.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.mapPort.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
