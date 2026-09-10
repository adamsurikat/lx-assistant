import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { POSTIT_COLORS } from "@/lib/postits";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const existing = await prisma.postIt.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    text?: string;
    color?: string;
    x?: number;
    y?: number;
    rotation?: number;
    bringToFront?: boolean;
  };

  let zIndex = existing.zIndex;
  if (body.bringToFront) {
    const top = await prisma.postIt.aggregate({
      where: { userId: session.user.id, deletedAt: null },
      _max: { zIndex: true },
    });
    zIndex = (top._max.zIndex ?? 0) + 1;
  }

  const postIt = await prisma.postIt.update({
    where: { id },
    data: {
      ...(body.text !== undefined ? { text: body.text } : {}),
      ...(body.color !== undefined && (POSTIT_COLORS as readonly string[]).includes(body.color)
        ? { color: body.color }
        : {}),
      ...(body.x !== undefined ? { x: body.x } : {}),
      ...(body.y !== undefined ? { y: body.y } : {}),
      ...(body.rotation !== undefined ? { rotation: body.rotation } : {}),
      zIndex,
    },
  });

  return NextResponse.json({ postIt });
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

  const existing = await prisma.postIt.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // A note with actual (non-whitespace) content is moved to the trash
  // instead of being deleted outright, so it can be restored later.
  // Blank notes carry nothing worth recovering, and a note that's already
  // in the trash being deleted again means the user is emptying the
  // trash — both cases remove the row for good.
  if (existing.deletedAt || existing.text.trim() === "") {
    await prisma.postIt.delete({ where: { id } });
    return NextResponse.json({ ok: true, trashed: false });
  }

  await prisma.postIt.update({ where: { id }, data: { deletedAt: new Date() } });
  return NextResponse.json({ ok: true, trashed: true });
}
