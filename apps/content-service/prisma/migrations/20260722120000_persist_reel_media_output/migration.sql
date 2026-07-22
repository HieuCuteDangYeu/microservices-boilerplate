-- Persist the durable outputs produced by the media-processing worker.
ALTER TABLE "Reel"
ADD COLUMN "hlsMasterKey" TEXT,
ADD COLUMN "transcriptionAudioManifestKey" TEXT,
ADD COLUMN "mediaOutput" JSONB;
