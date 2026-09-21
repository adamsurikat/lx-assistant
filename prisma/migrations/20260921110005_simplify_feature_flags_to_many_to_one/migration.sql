-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "FeatureFlag";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "_FeatureFlagToMapDepot";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "_FeatureFlagToMapPort";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "_FeatureFlagToMapRoute";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "MapPortFeatureFlag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "mapPortId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MapPortFeatureFlag_mapPortId_fkey" FOREIGN KEY ("mapPortId") REFERENCES "MapPort" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MapDepotFeatureFlag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "mapDepotId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MapDepotFeatureFlag_mapDepotId_fkey" FOREIGN KEY ("mapDepotId") REFERENCES "MapDepot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MapRouteFeatureFlag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "mapRouteId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MapRouteFeatureFlag_mapRouteId_fkey" FOREIGN KEY ("mapRouteId") REFERENCES "MapRoute" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "MapPortFeatureFlag_mapPortId_name_key" ON "MapPortFeatureFlag"("mapPortId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "MapDepotFeatureFlag_mapDepotId_name_key" ON "MapDepotFeatureFlag"("mapDepotId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "MapRouteFeatureFlag_mapRouteId_name_key" ON "MapRouteFeatureFlag"("mapRouteId", "name");

