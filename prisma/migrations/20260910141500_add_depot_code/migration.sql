-- Add code column to MapDepot, mirroring MapPort.code
ALTER TABLE "MapDepot" ADD COLUMN "code" TEXT NOT NULL DEFAULT '';
