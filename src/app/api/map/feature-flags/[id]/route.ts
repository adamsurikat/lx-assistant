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

  const existing = await prisma.featureFlag.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    color?: string;
  };

  try {
    const featureFlag = await prisma.featureFlag.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.color !== undefined ? { color: body.color.trim() } : {}),
      },
    });
    return NextResponse.json({ featureFlag });
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err && err.code === "P2002") {
      return NextResponse.json(
        { error: "A feature flag with that name already exists" },
        { status: 409 }
      );
    }
    throw err;
  }
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

  const existing = await prisma.featureFlag.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Just deletes the flag row — Prisma automatically drops the join-table
  // rows in _FeatureFlagToMapPort/_FeatureFlagToMapDepot/_FeatureFlagToMapRoute
  // for it, without touching the ports/depots/routes themselves.
  await prisma.featureFlag.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
