INSERT INTO "MapDepotFeatureFlag" ("id", "name", "mapDepotId")
SELECT 'lmv-' || depot."id", 'lmv', depot."id"
FROM "MapDepot" AS depot
WHERE NOT EXISTS (
    SELECT 1
    FROM "MapDepotFeatureFlag" AS featureFlag
    WHERE featureFlag."mapDepotId" = depot."id"
      AND featureFlag."name" = 'lmv'
);
