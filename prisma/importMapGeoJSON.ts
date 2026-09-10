// Bootstraps the MapPort/MapDepot/MapRoute tables from a GeoJSON export
// (see GET /api/map/export and README "Bootstrapping map data"). This is
// the recommended way for a new deployment to get real map data instead of
// starting from an empty map: export from an existing instance, commit/
// share the .geojson file, then run this script against the new database.
//
// Safe to re-run: ports/depots/routes that already exist (matched by code,
// or name if codeless — see lib/mapGeoJSON.ts) are skipped rather than
// duplicated.
//
// Usage: npx tsx prisma/importMapGeoJSON.ts [path/to/file.geojson]
// Defaults to prisma/mapData.geojson (a snapshot of this project's own map
// data) if no path is given.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { importMapGeoJSON, parseMapGeoJSON } from "../src/lib/mapGeoJSON";

const prisma = new PrismaClient();

async function main() {
  const filePath = process.argv[2] ?? join(__dirname, "mapData.geojson");
  console.log(`Importing map data from ${filePath} ...`);

  const raw = readFileSync(filePath, "utf-8");
  const parsed = parseMapGeoJSON(JSON.parse(raw));
  const result = await importMapGeoJSON(prisma, parsed);

  console.log(
    `Ports:  ${result.portsCreated} created, ${result.portsSkipped} already existed\n` +
      `Depots: ${result.depotsCreated} created, ${result.depotsSkipped} already existed\n` +
      `Routes: ${result.routesCreated} created, ${result.routesSkipped} already existed/unresolved`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
