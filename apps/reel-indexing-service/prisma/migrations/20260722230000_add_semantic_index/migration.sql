CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "IndexJobCheckpoint" RENAME TO "IndexingAttempt";
ALTER TABLE "IndexingAttempt" RENAME CONSTRAINT "IndexJobCheckpoint_pkey" TO "IndexingAttempt_pkey";
ALTER INDEX "IndexJobCheckpoint_jobId_key" RENAME TO "IndexingAttempt_jobId_key";
ALTER INDEX "IndexJobCheckpoint_reelId_idx" RENAME TO "IndexingAttempt_reelId_idx";
ALTER INDEX "IndexJobCheckpoint_status_updatedAt_idx" RENAME TO "IndexingAttempt_status_updatedAt_idx";

DO $$
DECLARE
  installed_version TEXT;
  version_parts INTEGER[];
BEGIN
  SELECT extversion INTO installed_version
  FROM pg_extension
  WHERE extname = 'vector';

  IF installed_version IS NULL THEN
    RAISE EXCEPTION 'pgvector extension is required';
  END IF;

  version_parts := string_to_array(regexp_replace(installed_version, '[^0-9.].*$', ''), '.')::INTEGER[];
  IF version_parts < ARRAY[0, 8, 0] THEN
    RAISE EXCEPTION 'pgvector 0.8.0 or newer is required; found %', installed_version;
  END IF;
END $$;

CREATE TABLE "ReelDocument" (
  "rowId" TEXT NOT NULL,
  "id" TEXT NOT NULL,
  "reelId" TEXT NOT NULL,
  "indexAttemptId" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "userId" TEXT NOT NULL,
  "parentId" TEXT,
  "title" TEXT,
  "description" TEXT,
  "text" TEXT NOT NULL,
  "tags" TEXT[] NOT NULL,
  "startTime" DOUBLE PRECISION,
  "endTime" DOUBLE PRECISION,
  "sourceDurationMs" INTEGER NOT NULL,
  "sourceOrientation" TEXT NOT NULL,
  "sourceLengthClass" TEXT NOT NULL,
  "embedding" vector(384) NOT NULL,
  "searchVector" tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('simple', coalesce("description", '')), 'B') ||
    setweight(to_tsvector('simple', coalesce("text", '')), 'C')
  ) STORED,
  "embeddingProvider" TEXT NOT NULL,
  "embeddingModel" TEXT NOT NULL,
  "embeddingDimensions" INTEGER NOT NULL,
  "embeddingVersion" TEXT NOT NULL,
  "embeddingInputHash" TEXT NOT NULL,
  "indexVersion" TEXT NOT NULL,
  "chunkingVersion" TEXT NOT NULL,
  "summaryVersion" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReelDocument_pkey" PRIMARY KEY ("rowId")
);

CREATE TABLE "ReelSection" (LIKE "ReelDocument" INCLUDING DEFAULTS INCLUDING GENERATED);
ALTER TABLE "ReelSection" DROP CONSTRAINT IF EXISTS "ReelDocument_pkey";
ALTER TABLE "ReelSection" ADD CONSTRAINT "ReelSection_pkey" PRIMARY KEY ("rowId");
ALTER TABLE "ReelSection" ALTER COLUMN "parentId" SET NOT NULL;
ALTER TABLE "ReelSection" ALTER COLUMN "startTime" SET NOT NULL;
ALTER TABLE "ReelSection" ALTER COLUMN "endTime" SET NOT NULL;

CREATE TABLE "ReelChunk" (LIKE "ReelDocument" INCLUDING DEFAULTS INCLUDING GENERATED);
ALTER TABLE "ReelChunk" DROP CONSTRAINT IF EXISTS "ReelDocument_pkey";
ALTER TABLE "ReelChunk" ADD CONSTRAINT "ReelChunk_pkey" PRIMARY KEY ("rowId");
ALTER TABLE "ReelChunk" ALTER COLUMN "parentId" SET NOT NULL;

CREATE TABLE "TranscriptionSegment" (
  "id" TEXT NOT NULL,
  "reelId" TEXT NOT NULL,
  "indexAttemptId" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "startTime" DOUBLE PRECISION NOT NULL,
  "endTime" DOUBLE PRECISION NOT NULL,
  "text" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TranscriptionSegment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReelDocument_id_indexAttemptId_key" ON "ReelDocument"("id", "indexAttemptId");
CREATE UNIQUE INDEX "ReelDocument_reelId_indexAttemptId_key" ON "ReelDocument"("reelId", "indexAttemptId");
CREATE UNIQUE INDEX "ReelSection_id_indexAttemptId_key" ON "ReelSection"("id", "indexAttemptId");
CREATE UNIQUE INDEX "ReelChunk_id_indexAttemptId_key" ON "ReelChunk"("id", "indexAttemptId");
CREATE UNIQUE INDEX "TranscriptionSegment_indexAttemptId_ordinal_key" ON "TranscriptionSegment"("indexAttemptId", "ordinal");

CREATE UNIQUE INDEX "ReelDocument_one_active_reel_idx" ON "ReelDocument"("reelId") WHERE "isActive";
CREATE UNIQUE INDEX "ReelSection_one_active_id_idx" ON "ReelSection"("id") WHERE "isActive";
CREATE UNIQUE INDEX "ReelChunk_one_active_id_idx" ON "ReelChunk"("id") WHERE "isActive";

CREATE INDEX "ReelDocument_reelId_isActive_idx" ON "ReelDocument"("reelId", "isActive");
CREATE INDEX "ReelDocument_userId_isActive_idx" ON "ReelDocument"("userId", "isActive");
CREATE INDEX "ReelDocument_sourceLengthClass_isActive_idx" ON "ReelDocument"("sourceLengthClass", "isActive");
CREATE INDEX "ReelSection_reelId_isActive_idx" ON "ReelSection"("reelId", "isActive");
CREATE INDEX "ReelSection_parentId_isActive_idx" ON "ReelSection"("parentId", "isActive");
CREATE INDEX "ReelSection_userId_isActive_idx" ON "ReelSection"("userId", "isActive");
CREATE INDEX "ReelChunk_reelId_isActive_idx" ON "ReelChunk"("reelId", "isActive");
CREATE INDEX "ReelChunk_parentId_isActive_idx" ON "ReelChunk"("parentId", "isActive");
CREATE INDEX "ReelChunk_userId_isActive_idx" ON "ReelChunk"("userId", "isActive");
CREATE INDEX "TranscriptionSegment_reelId_indexAttemptId_idx" ON "TranscriptionSegment"("reelId", "indexAttemptId");

CREATE INDEX "ReelDocument_tags_gin_idx" ON "ReelDocument" USING gin ("tags");
CREATE INDEX "ReelSection_tags_gin_idx" ON "ReelSection" USING gin ("tags");
CREATE INDEX "ReelChunk_tags_gin_idx" ON "ReelChunk" USING gin ("tags");
CREATE INDEX "ReelDocument_searchVector_gin_idx" ON "ReelDocument" USING gin ("searchVector");
CREATE INDEX "ReelSection_searchVector_gin_idx" ON "ReelSection" USING gin ("searchVector");
CREATE INDEX "ReelChunk_searchVector_gin_idx" ON "ReelChunk" USING gin ("searchVector");

CREATE INDEX "ReelDocument_embedding_hnsw_idx" ON "ReelDocument"
USING hnsw ("embedding" vector_cosine_ops) WITH (m = 16, ef_construction = 64)
WHERE "isActive";
CREATE INDEX "ReelSection_embedding_hnsw_idx" ON "ReelSection"
USING hnsw ("embedding" vector_cosine_ops) WITH (m = 16, ef_construction = 64)
WHERE "isActive";
CREATE INDEX "ReelChunk_embedding_hnsw_idx" ON "ReelChunk"
USING hnsw ("embedding" vector_cosine_ops) WITH (m = 16, ef_construction = 64)
WHERE "isActive";
