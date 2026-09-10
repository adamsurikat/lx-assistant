import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { mapDataToGeoJSON } from "@/lib/mapGeoJSON";

// Exports every MapPort/MapDepot/MapRoute row as a single GeoJSON
// FeatureCollection — used both to back up/version the map's data and, via
// prisma/importMapGeoJSON.ts, to bootstrap a fresh database for a new
// deployment (see README "Bootstrapping map data").
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [ports, depots, routes] = await Promise.all([
    prisma.mapPort.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.mapDepot.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.mapRoute.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  const geojson = mapDataToGeoJSON(ports, depots, routes);

  return new NextResponse(JSON.stringify(geojson, null, 2), {
    headers: {
      "Content-Type": "application/geo+json",
      "Content-Disposition": 'attachment; filename="map-data.geojson"',
    },
  });
}
