-- RedefineTables
-- MapRoute's start/end become FKs to MapPort instead of free lat/lng, so a
-- route is always anchored to an actual port. Existing rows are matched to
-- their port by coordinates (all seeded routes start/end exactly at a port).
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MapRoute" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "startPortId" TEXT NOT NULL,
    "endPortId" TEXT NOT NULL,
    "control1Lat" REAL NOT NULL,
    "control1Lng" REAL NOT NULL,
    "control2Lat" REAL NOT NULL,
    "control2Lng" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MapRoute_startPortId_fkey" FOREIGN KEY ("startPortId") REFERENCES "MapPort" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MapRoute_endPortId_fkey" FOREIGN KEY ("endPortId") REFERENCES "MapPort" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_MapRoute" ("id", "name", "description", "startPortId", "endPortId", "control1Lat", "control1Lng", "control2Lat", "control2Lng", "createdAt", "updatedAt")
SELECT
  r."id",
  r."name",
  r."description",
  (SELECT p."id" FROM "MapPort" p WHERE p."lat" = r."startLat" AND p."lng" = r."startLng" LIMIT 1),
  (SELECT p."id" FROM "MapPort" p WHERE p."lat" = r."endLat" AND p."lng" = r."endLng" LIMIT 1),
  r."control1Lat",
  r."control1Lng",
  r."control2Lat",
  r."control2Lng",
  r."createdAt",
  r."updatedAt"
FROM "MapRoute" r
WHERE EXISTS (SELECT 1 FROM "MapPort" p WHERE p."lat" = r."startLat" AND p."lng" = r."startLng")
  AND EXISTS (SELECT 1 FROM "MapPort" p WHERE p."lat" = r."endLat" AND p."lng" = r."endLng");
DROP TABLE "MapRoute";
ALTER TABLE "new_MapRoute" RENAME TO "MapRoute";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
