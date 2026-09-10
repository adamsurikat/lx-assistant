-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MapDepot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "tenant" TEXT NOT NULL DEFAULT '',
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_MapDepot" ("country", "createdAt", "description", "id", "lat", "lng", "name", "updatedAt") SELECT "country", "createdAt", "description", "id", "lat", "lng", "name", "updatedAt" FROM "MapDepot";
DROP TABLE "MapDepot";
ALTER TABLE "new_MapDepot" RENAME TO "MapDepot";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
