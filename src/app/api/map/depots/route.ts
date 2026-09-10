import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const depots = await prisma.mapDepot.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json({ depots });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    code?: string;
    country?: string;
    description?: string;
    tenant?: string;
    lat?: number;
    lng?: number;
  };

  if (typeof body.lat !== "number" || typeof body.lng !== "number") {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }

  const depot = await prisma.mapDepot.create({
    data: {
      name: body.name?.trim() || "New depot",
      code: body.code?.trim().toUpperCase() || "",
      country: body.country?.trim() || "",
      description: body.description ?? "",
      tenant: body.tenant?.trim().toLowerCase() || "",
      lat: body.lat,
      lng: body.lng,
    },
  });

  return NextResponse.json({ depot });
}
