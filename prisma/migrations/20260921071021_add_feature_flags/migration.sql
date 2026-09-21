-- CreateTable
CREATE TABLE "FeatureFlag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "_FeatureFlagToMapPort" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_FeatureFlagToMapPort_A_fkey" FOREIGN KEY ("A") REFERENCES "FeatureFlag" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_FeatureFlagToMapPort_B_fkey" FOREIGN KEY ("B") REFERENCES "MapPort" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_FeatureFlagToMapDepot" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_FeatureFlagToMapDepot_A_fkey" FOREIGN KEY ("A") REFERENCES "FeatureFlag" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_FeatureFlagToMapDepot_B_fkey" FOREIGN KEY ("B") REFERENCES "MapDepot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_FeatureFlagToMapRoute" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_FeatureFlagToMapRoute_A_fkey" FOREIGN KEY ("A") REFERENCES "FeatureFlag" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_FeatureFlagToMapRoute_B_fkey" FOREIGN KEY ("B") REFERENCES "MapRoute" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "FeatureFlag_name_key" ON "FeatureFlag"("name");

-- CreateIndex
CREATE UNIQUE INDEX "_FeatureFlagToMapPort_AB_unique" ON "_FeatureFlagToMapPort"("A", "B");

-- CreateIndex
CREATE INDEX "_FeatureFlagToMapPort_B_index" ON "_FeatureFlagToMapPort"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_FeatureFlagToMapDepot_AB_unique" ON "_FeatureFlagToMapDepot"("A", "B");

-- CreateIndex
CREATE INDEX "_FeatureFlagToMapDepot_B_index" ON "_FeatureFlagToMapDepot"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_FeatureFlagToMapRoute_AB_unique" ON "_FeatureFlagToMapRoute"("A", "B");

-- CreateIndex
CREATE INDEX "_FeatureFlagToMapRoute_B_index" ON "_FeatureFlagToMapRoute"("B");
