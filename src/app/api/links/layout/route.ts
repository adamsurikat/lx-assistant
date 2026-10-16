import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  isValidLinkCardOrder,
  normalizeLinkCardOrder,
  readLinkCardOrder,
} from "@/lib/linksLayout";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const layout = await prisma.userLinkLayout.findUnique({
    where: { userId: session.user.id },
    select: { orderJson: true },
  });

  return NextResponse.json(
    { order: readLinkCardOrder(layout?.orderJson) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || !("order" in body) || !isValidLinkCardOrder(body.order)) {
    return NextResponse.json(
      { error: "order must be an array of unique, known card IDs." },
      { status: 400 },
    );
  }

  const order = normalizeLinkCardOrder(body.order);
  const orderJson = JSON.stringify(order);
  await prisma.userLinkLayout.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, orderJson },
    update: { orderJson },
  });

  return NextResponse.json({ order });
}
