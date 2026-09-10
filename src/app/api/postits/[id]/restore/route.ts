import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Restores a trashed note back onto the board — clears its deletedAt
// marker and brings it to the front (above whatever's there now) so it's
// immediately visible rather than reappearing buried underneath.
export async function POST(
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
  if (!existing || !existing.deletedAt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const top = await prisma.postIt.aggregate({
    where: { userId: session.user.id, deletedAt: null },
    _max: { zIndex: true },
  });

  const postIt = await prisma.postIt.update({
    where: { id },
    data: { deletedAt: null, zIndex: (top._max.zIndex ?? 0) + 1 },
  });

  return NextResponse.json({ postIt });
}
