import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Prisma, type PrismaClient } from "@prisma/client";
import { importMapGeoJSON, parseMapGeoJSON } from "./mapGeoJSON";

/** Seed an empty map without changing existing or partially populated maps. */
export async function seedMapDataIfEmpty(
  prisma: PrismaClient,
  filePath = join(process.cwd(), "prisma", "mapData.geojson"),
) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const counts = await Promise.all([
            tx.mapPort.count(),
            tx.mapDepot.count(),
            tx.mapRoute.count(),
          ]);
          if (counts.some((count) => count > 0)) return null;

          const raw = await readFile(filePath, "utf8");
          const parsed = parseMapGeoJSON(JSON.parse(raw));
          return importMapGeoJSON(tx, parsed);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 },
      );
    } catch (error) {
      // Concurrent server starts must recheck the empty-map condition after
      // a transaction conflict, rather than importing the same data twice.
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2034" ||
        attempt >= 2
      ) {
        throw error;
      }
    }
  }
}
