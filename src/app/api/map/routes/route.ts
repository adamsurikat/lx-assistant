import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const routes = await prisma.mapRoute.findMany({
    orderBy: { createdAt: "asc" },
    include: { startPort: true, endPort: true, featureFlags: true },
  });
  return NextResponse.json({ routes });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
    startPortId?: string;
    endPortId?: string;
    control1Lat?: number;
    control1Lng?: number;
    control2Lat?: number;
    control2Lng?: number;
    featureFlagNames?: string[];
  };

  if (typeof body.startPortId !== "string" || typeof body.endPortId !== "string") {
    return NextResponse.json(
      { error: "startPortId and endPortId are required — a route must always connect two ports" },
      { status: 400 }
    );
  }
  const required = [body.control1Lat, body.control1Lng, body.control2Lat, body.control2Lng];
  if (required.some((v) => typeof v !== "number")) {
    return NextResponse.json(
      { error: "control1Lat, control1Lng, control2Lat and control2Lng are required" },
      { status: 400 }
    );
  }

  const [startPort, endPort] = await Promise.all([
    prisma.mapPort.findUnique({ where: { id: body.startPortId } }),
    prisma.mapPort.findUnique({ where: { id: body.endPortId } }),
  ]);
  if (!startPort || !endPort) {
    return NextResponse.json({ error: "startPortId or endPortId does not match an existing port" }, { status: 400 });
  }

  const route = await prisma.mapRoute.create({
    data: {
      name: body.name?.trim() || "New route",
      description: body.description ?? "",
      startPortId: body.startPortId,
      endPortId: body.endPortId,
      control1Lat: body.control1Lat!,
      control1Lng: body.control1Lng!,
      control2Lat: body.control2Lat!,
      control2Lng: body.control2Lng!,
      ...(body.featureFlagNames
        ? { featureFlags: { create: body.featureFlagNames.map((name) => ({ name })) } }
        : {}),
    },
    include: { startPort: true, endPort: true, featureFlags: true },
  });

  return NextResponse.json({ route });
}
