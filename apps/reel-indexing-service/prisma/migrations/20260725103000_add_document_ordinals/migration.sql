ALTER TABLE "ReelDocument"
  ADD COLUMN "ordinal" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ReelSection"
  ADD COLUMN "ordinal" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ReelChunk"
  ADD COLUMN "ordinal" INTEGER NOT NULL DEFAULT 0;

UPDATE "ReelSection"
SET "ordinal" = COALESCE(
  NULLIF(regexp_replace("id", '^.*:section:([0-9]+)$', '\\1'), "id")::integer,
  0
)
WHERE "id" ~ ':section:[0-9]+$';

UPDATE "ReelChunk"
SET "ordinal" = COALESCE(
  NULLIF(regexp_replace("id", '^.*:chunk:([0-9]+)$', '\\1'), "id")::integer,
  0
)
WHERE "id" ~ ':chunk:[0-9]+$';

CREATE INDEX "ReelDocument_reelId_indexAttemptId_ordinal_idx"
  ON "ReelDocument"("reelId", "indexAttemptId", "ordinal");
CREATE INDEX "ReelSection_reelId_indexAttemptId_ordinal_idx"
  ON "ReelSection"("reelId", "indexAttemptId", "ordinal");
CREATE INDEX "ReelChunk_parentId_isActive_ordinal_idx"
  ON "ReelChunk"("parentId", "isActive", "ordinal");
