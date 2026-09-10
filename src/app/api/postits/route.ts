import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { POSTIT_COLORS } from "@/lib/postits";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const postIts = await prisma.postIt.findMany({
    where: { userId: session.user.id, deletedAt: null },
    orderBy: { zIndex: "asc" },
  });

  return NextResponse.json({ postIts });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    x?: number;
    y?: number;
    color?: string;
  };

  const color =
    body.color && (POSTIT_COLORS as readonly string[]).includes(body.color)
      ? body.color
      : "yellow";
  // Raise the new note above everything else already on the board.
  const top = await prisma.postIt.aggregate({
    where: { userId: session.user.id, deletedAt: null },
    _max: { zIndex: true },
  });
  const rotation = Math.round((Math.random() * 6 - 3) * 10) / 10;

  const postIt = await prisma.postIt.create({
    data: {
      userId: session.user.id,
      x: body.x ?? 40,
      y: body.y ?? 40,
      color,
      rotation,
      zIndex: (top._max.zIndex ?? 0) + 1,
    },
  });

  return NextResponse.json({ postIt });
}
