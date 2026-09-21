import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Feature flags are tags (e.g. "beta", "deprecated") that can be attached
// to any number of ports, depots, and routes on the Map page — see
// FeatureFlag in prisma/schema.prisma for the many-to-many shape.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const featureFlags = await prisma.featureFlag.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json({ featureFlags });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    color?: string;
  };

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  try {
    const featureFlag = await prisma.featureFlag.create({
      data: { name, color: body.color?.trim() || "" },
    });
    return NextResponse.json({ featureFlag });
  } catch (err) {
    // P2002 = unique constraint violation (name already exists).
    if (typeof err === "object" && err !== null && "code" in err && err.code === "P2002") {
      return NextResponse.json(
        { error: "A feature flag with that name already exists" },
        { status: 409 }
      );
    }
    throw err;
  }
}
