import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { importMapGeoJSON, parseMapGeoJSON } from "@/lib/mapGeoJSON";

// Imports a GeoJSON FeatureCollection (as produced by GET /api/map/export,
// or hand-authored following the same shape — see README "Bootstrapping map
// data") into the database. Safe to re-run: ports/depots/routes that
// already exist (matched by code/name, see lib/mapGeoJSON.ts) are skipped
// rather than duplicated.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (body === null) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parseMapGeoJSON(body);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid GeoJSON" },
      { status: 400 },
    );
  }

  const result = await importMapGeoJSON(prisma, parsed);
  return NextResponse.json(result);
}
