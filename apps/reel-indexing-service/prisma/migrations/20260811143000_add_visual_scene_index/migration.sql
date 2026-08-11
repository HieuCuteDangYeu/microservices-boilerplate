ALTER TYPE "IndexDocumentKind" ADD VALUE IF NOT EXISTS 'VISUAL_SCENE';

CREATE TABLE "ReelVisualScene" (LIKE "ReelChunk" INCLUDING DEFAULTS INCLUDING GENERATED);
ALTER TABLE "ReelVisualScene" DROP CONSTRAINT IF EXISTS "ReelChunk_pkey";
ALTER TABLE "ReelVisualScene" ADD CONSTRAINT "ReelVisualScene_pkey" PRIMARY KEY ("rowId");
ALTER TABLE "ReelVisualScene" ALTER COLUMN "startTime" SET NOT NULL;
ALTER TABLE "ReelVisualScene" ALTER COLUMN "endTime" SET NOT NULL;

CREATE UNIQUE INDEX "ReelVisualScene_id_indexAttemptId_key"
  ON "ReelVisualScene"("id", "indexAttemptId");
CREATE UNIQUE INDEX "ReelVisualScene_one_active_id_idx"
  ON "ReelVisualScene"("id") WHERE "isActive";

CREATE INDEX "ReelVisualScene_reelId_isActive_idx"
  ON "ReelVisualScene"("reelId", "isActive");
CREATE INDEX "ReelVisualScene_parentId_isActive_idx"
  ON "ReelVisualScene"("parentId", "isActive");
CREATE INDEX "ReelVisualScene_userId_isActive_idx"
  ON "ReelVisualScene"("userId", "isActive");
CREATE INDEX "ReelVisualScene_parentId_isActive_ordinal_idx"
  ON "ReelVisualScene"("parentId", "isActive", "ordinal");

CREATE INDEX "ReelVisualScene_tags_gin_idx"
  ON "ReelVisualScene" USING gin ("tags");
CREATE INDEX "ReelVisualScene_searchVector_gin_idx"
  ON "ReelVisualScene" USING gin ("searchVector");

CREATE INDEX "ReelVisualScene_embedding_hnsw_idx"
  ON "ReelVisualScene"
  USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE "isActive";
