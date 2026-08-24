-- UserMemory content and metadata are authoritative. Embeddings are derived.
-- Production rollout requires separate authorization because this migration
-- clears only the legacy derived vectors before changing their dimensions.
ALTER TABLE "UserMemory"
ADD COLUMN IF NOT EXISTS "embeddingDimensions" INTEGER,
ADD COLUMN IF NOT EXISTS "embeddingVersion" TEXT;

DROP INDEX IF EXISTS "UserMemory_embedding_hnsw_idx";
DROP INDEX IF EXISTS "UserMemory_userId_embeddingModel_idx";

UPDATE "UserMemory"
SET
  embedding = NULL,
  "embeddingModel" = NULL,
  "embeddingDimensions" = NULL,
  "embeddingVersion" = NULL
WHERE embedding IS NOT NULL
   OR "embeddingModel" IS NOT NULL
   OR "embeddingDimensions" IS NOT NULL
   OR "embeddingVersion" IS NOT NULL;

ALTER TABLE "UserMemory"
ALTER COLUMN embedding TYPE vector(1024)
USING embedding::vector(1024);

CREATE INDEX "UserMemory_userId_embeddingModel_embeddingDimensions_embeddingVersion_idx"
ON "UserMemory"(
  "userId",
  "embeddingModel",
  "embeddingDimensions",
  "embeddingVersion"
);

CREATE INDEX "UserMemory_embedding_hnsw_idx"
ON "UserMemory"
USING hnsw (embedding vector_cosine_ops)
WHERE embedding IS NOT NULL;
