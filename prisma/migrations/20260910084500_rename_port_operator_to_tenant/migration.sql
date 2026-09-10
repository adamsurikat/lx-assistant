-- Rename MapPort.operator to MapPort.tenant, preserving existing data
-- (SQLite 3.25+ supports ALTER TABLE ... RENAME COLUMN directly).
ALTER TABLE "MapPort" RENAME COLUMN "operator" TO "tenant";
