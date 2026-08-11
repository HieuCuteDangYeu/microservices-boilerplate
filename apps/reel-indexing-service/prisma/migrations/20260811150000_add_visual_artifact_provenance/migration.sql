ALTER TABLE "ReelDocument"
  ADD COLUMN "sourceVisualArtifactIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "ReelSection"
  ADD COLUMN "sourceVisualArtifactIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "ReelChunk"
  ADD COLUMN "sourceVisualArtifactIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "ReelVisualScene"
  ADD COLUMN "sourceVisualArtifactIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
