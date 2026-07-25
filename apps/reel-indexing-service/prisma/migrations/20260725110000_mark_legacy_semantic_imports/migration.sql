ALTER TABLE "ReelDocument"
  ADD COLUMN "isLegacyImport" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ReelSection"
  ADD COLUMN "isLegacyImport" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ReelChunk"
  ADD COLUMN "isLegacyImport" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "ReelDocument_isLegacyImport_isActive_idx"
  ON "ReelDocument"("isLegacyImport", "isActive");
