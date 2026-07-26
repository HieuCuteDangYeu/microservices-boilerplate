ALTER TABLE "Reel"
  ADD COLUMN "indexVersion" TEXT,
  ADD COLUMN "indexCompletedAt" TIMESTAMP(3),
  ADD COLUMN "indexDocumentCount" INTEGER,
  ADD COLUMN "indexSectionCount" INTEGER,
  ADD COLUMN "indexChunkCount" INTEGER,
  ADD COLUMN "indexEmbeddingProvider" TEXT,
  ADD COLUMN "indexEmbeddingModel" TEXT,
  ADD COLUMN "indexEmbeddingDimensions" INTEGER,
  ADD COLUMN "indexEmbeddingVersion" TEXT;

CREATE INDEX "Reel_indexVersion_idx" ON "Reel"("indexVersion");
