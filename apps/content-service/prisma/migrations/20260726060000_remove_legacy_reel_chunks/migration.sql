-- Content no longer owns semantic chunks or embeddings. Canonical retrieval
-- documents live exclusively in reel-indexing-service.
DROP INDEX IF EXISTS "ReelChunk_text_fts_idx";
DROP INDEX IF EXISTS "ReelChunk_reelId_chunkIndex_key";
DROP INDEX IF EXISTS "ReelChunk_createdAt_idx";
DROP INDEX IF EXISTS "ReelChunk_userId_idx";
DROP INDEX IF EXISTS "ReelChunk_reelId_idx";

ALTER TABLE "ReelChunk"
  DROP CONSTRAINT IF EXISTS "ReelChunk_reelId_fkey";

DROP TABLE "ReelChunk";
