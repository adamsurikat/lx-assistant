import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ports = await prisma.mapPort.findMany({
    orderBy: { createdAt: "asc" },
    include: { featureFlags: true },
  });
  return NextResponse.json({ ports });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  if (typeof body.lat !== "number" || typeof body.lng !== "number") {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }

  const port = await prisma.mapPort.create({
    data: {
      name: body.name?.trim() || "New port",
      code: body.code?.trim() || "",
      tenant: body.tenant?.trim().toLowerCase() || "",
      country: body.country?.trim() || "",
      description: body.description ?? "",
      lat: body.lat,
      lng: body.lng,
      ...(body.featureFlagNames
        ? { featureFlags: { create: body.featureFlagNames.map((name) => ({ name })) } }
        : {}),
    },
    include: { featureFlags: true },
  });

  return NextResponse.json({ port });
}
