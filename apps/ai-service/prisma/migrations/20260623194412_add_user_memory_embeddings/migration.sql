CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "UserMemory"
ADD COLUMN IF NOT EXISTS "embedding" vector(384);

ALTER TABLE "UserMemory"
ADD COLUMN IF NOT EXISTS "embeddingModel" TEXT;

CREATE INDEX IF NOT EXISTS "UserMemory_userId_embeddingModel_idx"
ON "UserMemory"("userId", "embeddingModel");

CREATE INDEX IF NOT EXISTS "UserMemory_embedding_hnsw_idx"
ON "UserMemory"
USING hnsw ("embedding" vector_cosine_ops)
WHERE "embedding" IS NOT NULL;