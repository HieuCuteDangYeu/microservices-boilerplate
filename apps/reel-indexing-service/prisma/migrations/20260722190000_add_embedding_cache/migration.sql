CREATE TYPE "IndexDocumentKind" AS ENUM ('REEL', 'SECTION', 'CHUNK');

CREATE TABLE "EmbeddingCacheEntry" (
  "cacheKey" TEXT NOT NULL,
  "stableItemId" TEXT NOT NULL,
  "documentKind" "IndexDocumentKind" NOT NULL,
  "embeddingInputHash" TEXT NOT NULL,
  "embeddingProvider" TEXT NOT NULL,
  "embeddingModel" TEXT NOT NULL,
  "embeddingDimensions" INTEGER NOT NULL,
  "embeddingVersion" TEXT NOT NULL,
  "indexVersion" TEXT NOT NULL,
  "chunkingVersion" TEXT NOT NULL,
  "summaryVersion" TEXT NOT NULL,
  "embedding" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmbeddingCacheEntry_pkey" PRIMARY KEY ("cacheKey")
);

CREATE INDEX "EmbeddingCacheEntry_stableItemId_idx"
ON "EmbeddingCacheEntry"("stableItemId");

CREATE INDEX "EmbeddingCacheEntry_embeddingInputHash_embeddingVersion_idx"
ON "EmbeddingCacheEntry"("embeddingInputHash", "embeddingVersion");

CREATE INDEX "EmbeddingCacheEntry_indexVersion_chunkingVersion_summaryVersion_idx"
ON "EmbeddingCacheEntry"("indexVersion", "chunkingVersion", "summaryVersion");
