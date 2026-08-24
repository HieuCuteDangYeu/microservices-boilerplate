-- Existing 384-dimensional semantic rows must be reset before this migration and
-- rebuilt with BGE-M3 after deployment. pgvector cannot convert those vectors to
-- 1024 dimensions without generating new embeddings.
DROP INDEX "ReelDocument_embedding_hnsw_idx";
DROP INDEX "ReelSection_embedding_hnsw_idx";
DROP INDEX "ReelChunk_embedding_hnsw_idx";
DROP INDEX "ReelVisualScene_embedding_hnsw_idx";

ALTER TABLE "ReelDocument"
  ALTER COLUMN "embedding" TYPE vector(1024);
ALTER TABLE "ReelSection"
  ALTER COLUMN "embedding" TYPE vector(1024);
ALTER TABLE "ReelChunk"
  ALTER COLUMN "embedding" TYPE vector(1024);
ALTER TABLE "ReelVisualScene"
  ALTER COLUMN "embedding" TYPE vector(1024);

CREATE INDEX "ReelDocument_embedding_hnsw_idx" ON "ReelDocument"
USING hnsw ("embedding" vector_cosine_ops) WITH (m = 16, ef_construction = 64)
WHERE "isActive";

CREATE INDEX "ReelSection_embedding_hnsw_idx" ON "ReelSection"
USING hnsw ("embedding" vector_cosine_ops) WITH (m = 16, ef_construction = 64)
WHERE "isActive";

CREATE INDEX "ReelChunk_embedding_hnsw_idx" ON "ReelChunk"
USING hnsw ("embedding" vector_cosine_ops) WITH (m = 16, ef_construction = 64)
WHERE "isActive";

CREATE INDEX "ReelVisualScene_embedding_hnsw_idx" ON "ReelVisualScene"
USING hnsw ("embedding" vector_cosine_ops) WITH (m = 16, ef_construction = 64)
WHERE "isActive";
