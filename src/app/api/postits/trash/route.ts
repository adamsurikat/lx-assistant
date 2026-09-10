import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Lists a user's trashed (soft-deleted) post-its — only notes that had
// actual content when removed ever end up here (see the DELETE route on
// /api/postits/[id]), most-recently-deleted first.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const postIts = await prisma.postIt.findMany({
    where: { userId: session.user.id, deletedAt: { not: null } },
    orderBy: { deletedAt: "desc" },
  });

  return NextResponse.json({ postIts });
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Permanently purges every trashed note older than one week. Used by the
// trash panel's "Delete all older than a week" bulk action.
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - WEEK_MS);
  const { count } = await prisma.postIt.deleteMany({
    where: { userId: session.user.id, deletedAt: { lt: cutoff } },
  });

  return NextResponse.json({ count });
}
