import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Lightweight count-only endpoint for the nav badge, so we don't have to
// pull down every note's text/position just to show a number in the header.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const count = await prisma.postIt.count({
    where: { userId: session.user.id, deletedAt: null },
  });

  return NextResponse.json({ count });
}
