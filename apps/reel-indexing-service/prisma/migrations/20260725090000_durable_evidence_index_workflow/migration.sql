CREATE TYPE "EvidenceQuality" AS ENUM (
  'VERIFIED',
  'LOW_CONFIDENCE',
  'METADATA_ONLY'
);

ALTER TABLE "IndexingAttempt"
  ADD COLUMN "documentDrafts" JSONB,
  ADD COLUMN "mergedTranscriptHash" TEXT,
  ADD COLUMN "mergeAlgorithmVersion" TEXT;

ALTER TABLE "AudioSegmentCheckpoint"
  ADD COLUMN "transcriptionIdentity" TEXT;

CREATE TABLE "LangGraphCheckpoint" (
  "threadId" TEXT NOT NULL,
  "checkpointNamespace" TEXT NOT NULL,
  "checkpointId" TEXT NOT NULL,
  "parentCheckpointId" TEXT,
  "checkpointType" TEXT NOT NULL,
  "checkpoint" BYTEA NOT NULL,
  "metadataType" TEXT NOT NULL,
  "metadata" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LangGraphCheckpoint_pkey"
    PRIMARY KEY ("threadId", "checkpointNamespace", "checkpointId")
);

CREATE INDEX "LangGraphCheckpoint_threadId_checkpointNamespace_createdAt_idx"
  ON "LangGraphCheckpoint"("threadId", "checkpointNamespace", "createdAt");

CREATE TABLE "LangGraphCheckpointWrite" (
  "threadId" TEXT NOT NULL,
  "checkpointNamespace" TEXT NOT NULL,
  "checkpointId" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "writeIndex" INTEGER NOT NULL,
  "channel" TEXT NOT NULL,
  "valueType" TEXT NOT NULL,
  "value" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LangGraphCheckpointWrite_pkey"
    PRIMARY KEY (
      "threadId",
      "checkpointNamespace",
      "checkpointId",
      "taskId",
      "writeIndex"
    )
);

CREATE INDEX "LangGraphCheckpointWrite_thread_checkpoint_idx"
  ON "LangGraphCheckpointWrite"(
    "threadId",
    "checkpointNamespace",
    "checkpointId"
  );

DROP INDEX IF EXISTS "ReelDocument_searchVector_gin_idx";
DROP INDEX IF EXISTS "ReelSection_searchVector_gin_idx";
DROP INDEX IF EXISTS "ReelChunk_searchVector_gin_idx";

ALTER TABLE "ReelDocument"
  DROP COLUMN "searchVector",
  ADD COLUMN "evidenceText" TEXT,
  ADD COLUMN "retrievalText" TEXT,
  ADD COLUMN "derivedSummary" TEXT,
  ADD COLUMN "sourceSectionIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "sourceSegmentIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "sourceAudioArtifactIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "evidenceHash" TEXT,
  ADD COLUMN "retrievalHash" TEXT,
  ADD COLUMN "evidenceQuality" "EvidenceQuality" NOT NULL DEFAULT 'METADATA_ONLY',
  ADD COLUMN "transcriptVersion" TEXT,
  ADD COLUMN "sectioningVersion" TEXT NOT NULL DEFAULT 'legacy-time-window-v1',
  ADD COLUMN "tokenCount" INTEGER NOT NULL DEFAULT 1;

UPDATE "ReelDocument"
SET "retrievalText" = "text",
    "derivedSummary" = "description",
    "retrievalHash" = md5("text");

ALTER TABLE "ReelDocument"
  ALTER COLUMN "retrievalText" SET NOT NULL,
  ALTER COLUMN "retrievalHash" SET NOT NULL,
  DROP COLUMN "text",
  ADD COLUMN "searchVector" tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('simple', coalesce("description", '')), 'B') ||
    setweight(to_tsvector('simple', coalesce("retrievalText", '')), 'C')
  ) STORED;

ALTER TABLE "ReelSection"
  DROP COLUMN "searchVector",
  ADD COLUMN "evidenceText" TEXT,
  ADD COLUMN "retrievalText" TEXT,
  ADD COLUMN "derivedSummary" TEXT,
  ADD COLUMN "sourceSectionIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "sourceSegmentIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "sourceAudioArtifactIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "evidenceHash" TEXT,
  ADD COLUMN "retrievalHash" TEXT,
  ADD COLUMN "evidenceQuality" "EvidenceQuality" NOT NULL DEFAULT 'LOW_CONFIDENCE',
  ADD COLUMN "transcriptVersion" TEXT,
  ADD COLUMN "sectioningVersion" TEXT NOT NULL DEFAULT 'legacy-time-window-v1',
  ADD COLUMN "tokenCount" INTEGER NOT NULL DEFAULT 1;

UPDATE "ReelSection"
SET "evidenceText" = "text",
    "retrievalText" = "text",
    "derivedSummary" = "description",
    "sourceSectionIds" = ARRAY["id"],
    "evidenceHash" = md5("text"),
    "retrievalHash" = md5("text");

ALTER TABLE "ReelSection"
  ALTER COLUMN "retrievalText" SET NOT NULL,
  ALTER COLUMN "retrievalHash" SET NOT NULL,
  DROP COLUMN "text",
  ADD COLUMN "searchVector" tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('simple', coalesce("description", '')), 'B') ||
    setweight(to_tsvector('simple', coalesce("retrievalText", '')), 'C')
  ) STORED;

ALTER TABLE "ReelChunk"
  DROP COLUMN "searchVector",
  ADD COLUMN "evidenceText" TEXT,
  ADD COLUMN "retrievalText" TEXT,
  ADD COLUMN "derivedSummary" TEXT,
  ADD COLUMN "sourceSectionIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "sourceSegmentIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "sourceAudioArtifactIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "evidenceHash" TEXT,
  ADD COLUMN "retrievalHash" TEXT,
  ADD COLUMN "evidenceQuality" "EvidenceQuality" NOT NULL DEFAULT 'LOW_CONFIDENCE',
  ADD COLUMN "transcriptVersion" TEXT,
  ADD COLUMN "sectioningVersion" TEXT NOT NULL DEFAULT 'legacy-time-window-v1',
  ADD COLUMN "tokenCount" INTEGER NOT NULL DEFAULT 1;

UPDATE "ReelChunk"
SET "evidenceText" = "text",
    "retrievalText" = "text",
    "sourceSectionIds" = CASE
      WHEN "parentId" LIKE '%:section:%' THEN ARRAY["parentId"]
      ELSE ARRAY[]::TEXT[]
    END,
    "evidenceHash" = md5("text"),
    "retrievalHash" = md5("text");

ALTER TABLE "ReelChunk"
  ALTER COLUMN "retrievalText" SET NOT NULL,
  ALTER COLUMN "retrievalHash" SET NOT NULL,
  DROP COLUMN "text",
  ADD COLUMN "searchVector" tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('simple', coalesce("description", '')), 'B') ||
    setweight(to_tsvector('simple', coalesce("retrievalText", '')), 'C')
  ) STORED;

CREATE INDEX "ReelDocument_searchVector_gin_idx"
  ON "ReelDocument" USING gin ("searchVector");
CREATE INDEX "ReelSection_searchVector_gin_idx"
  ON "ReelSection" USING gin ("searchVector");
CREATE INDEX "ReelChunk_searchVector_gin_idx"
  ON "ReelChunk" USING gin ("searchVector");
