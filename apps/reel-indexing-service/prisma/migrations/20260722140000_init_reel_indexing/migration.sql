CREATE TYPE "IndexJobStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');
CREATE TYPE "IndexCheckpointStage" AS ENUM ('TRANSCRIBING_AUDIO_SEGMENTS', 'MERGING_TRANSCRIPT', 'EXTRACTING_METADATA', 'BUILDING_SECTIONS', 'BUILDING_CHUNKS', 'EMBEDDING', 'VALIDATING', 'PERSISTING');
CREATE TYPE "AudioSegmentStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "IndexJobCheckpoint" (
  "indexAttemptId" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "reelId" TEXT NOT NULL,
  "mediaAttemptId" TEXT NOT NULL,
  "indexVersion" TEXT NOT NULL,
  "status" "IndexJobStatus" NOT NULL DEFAULT 'PROCESSING',
  "stage" "IndexCheckpointStage" NOT NULL DEFAULT 'TRANSCRIBING_AUDIO_SEGMENTS',
  "mergedTranscript" TEXT,
  "mergedSegments" JSONB,
  "extractedMetadata" JSONB,
  "sections" JSONB,
  "chunks" JSONB,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IndexJobCheckpoint_pkey" PRIMARY KEY ("indexAttemptId")
);

CREATE TABLE "AudioSegmentCheckpoint" (
  "id" TEXT NOT NULL,
  "indexAttemptId" TEXT NOT NULL,
  "segmentNumber" INTEGER NOT NULL,
  "artifactKey" TEXT NOT NULL,
  "artifactChecksum" TEXT NOT NULL,
  "startMs" INTEGER NOT NULL,
  "endMs" INTEGER NOT NULL,
  "overlapBeforeMs" INTEGER NOT NULL,
  "provider" TEXT,
  "transcriptionModel" TEXT,
  "transcriptionVersion" TEXT,
  "status" "AudioSegmentStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "transcriptText" TEXT,
  "transcriptSegments" JSONB,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AudioSegmentCheckpoint_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IndexJobCheckpoint_jobId_key" ON "IndexJobCheckpoint"("jobId");
CREATE INDEX "IndexJobCheckpoint_reelId_idx" ON "IndexJobCheckpoint"("reelId");
CREATE INDEX "IndexJobCheckpoint_status_updatedAt_idx" ON "IndexJobCheckpoint"("status", "updatedAt");
CREATE UNIQUE INDEX "AudioSegmentCheckpoint_indexAttemptId_segmentNumber_key" ON "AudioSegmentCheckpoint"("indexAttemptId", "segmentNumber");
CREATE INDEX "AudioSegmentCheckpoint_indexAttemptId_status_idx" ON "AudioSegmentCheckpoint"("indexAttemptId", "status");

ALTER TABLE "AudioSegmentCheckpoint"
ADD CONSTRAINT "AudioSegmentCheckpoint_indexAttemptId_fkey"
FOREIGN KEY ("indexAttemptId") REFERENCES "IndexJobCheckpoint"("indexAttemptId")
ON DELETE CASCADE ON UPDATE CASCADE;
