-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MapPort" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_MapPort" ("country", "createdAt", "description", "id", "lat", "lng", "name", "updatedAt") SELECT "country", "createdAt", "description", "id", "lat", "lng", "name", "updatedAt" FROM "MapPort";
DROP TABLE "MapPort";
ALTER TABLE "new_MapPort" RENAME TO "MapPort";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
