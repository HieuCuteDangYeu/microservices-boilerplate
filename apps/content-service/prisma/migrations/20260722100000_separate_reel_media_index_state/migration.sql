CREATE TYPE "ReelMediaStatus" AS ENUM (
    'PENDING',
    'PROBING',
    'PROCESSING',
    'COMPLETED',
    'FAILED'
);

CREATE TYPE "ReelIndexStatus" AS ENUM (
    'NOT_REQUESTED',
    'PENDING',
    'PROCESSING',
    'COMPLETED',
    'DEGRADED',
    'FAILED'
);

CREATE TYPE "ReelSourceOrientation" AS ENUM ('PORTRAIT', 'LANDSCAPE', 'SQUARE');
CREATE TYPE "ReelSourceLengthClass" AS ENUM ('SHORT', 'LONG');

ALTER TABLE "Reel"
ADD COLUMN "mediaStatus" "ReelMediaStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "indexStatus" "ReelIndexStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
ADD COLUMN "mediaAttemptId" TEXT,
ADD COLUMN "indexAttemptId" TEXT,
ADD COLUMN "sourceOrientation" "ReelSourceOrientation",
ADD COLUMN "sourceLengthClass" "ReelSourceLengthClass",
ADD COLUMN "sourceAspectRatio" DOUBLE PRECISION,
ADD COLUMN "sourceEffectiveWidth" INTEGER,
ADD COLUMN "sourceEffectiveHeight" INTEGER;

UPDATE "Reel"
SET
    "mediaStatus" = CASE "status"::text
        WHEN 'PROCESSING' THEN 'PROCESSING'::"ReelMediaStatus"
        WHEN 'COMPLETED' THEN 'COMPLETED'::"ReelMediaStatus"
        WHEN 'FAILED' THEN 'FAILED'::"ReelMediaStatus"
        ELSE 'PENDING'::"ReelMediaStatus"
    END,
    "indexStatus" = CASE
        WHEN "status"::text = 'COMPLETED' AND EXISTS (
            SELECT 1
            FROM "ReelChunk" chunk
            WHERE chunk."reelId" = "Reel"."id"
        ) THEN 'COMPLETED'::"ReelIndexStatus"
        WHEN "status"::text = 'COMPLETED' THEN 'DEGRADED'::"ReelIndexStatus"
        ELSE 'NOT_REQUESTED'::"ReelIndexStatus"
    END,
    "mediaAttemptId" = "processingAttemptId",
    "sourceEffectiveWidth" = CASE
        WHEN MOD(MOD(COALESCE("sourceRotation", 0), 360) + 360, 360) IN (90, 270) THEN "sourceHeight"
        ELSE "sourceWidth"
    END,
    "sourceEffectiveHeight" = CASE
        WHEN MOD(MOD(COALESCE("sourceRotation", 0), 360) + 360, 360) IN (90, 270) THEN "sourceWidth"
        ELSE "sourceHeight"
    END;

UPDATE "Reel"
SET
    "sourceAspectRatio" = "sourceEffectiveWidth"::DOUBLE PRECISION / NULLIF("sourceEffectiveHeight", 0),
    "sourceOrientation" = CASE
        WHEN "sourceEffectiveWidth" IS NULL OR "sourceEffectiveHeight" IS NULL THEN NULL
        WHEN "sourceEffectiveWidth" <= 0 OR "sourceEffectiveHeight" <= 0 THEN NULL
        WHEN "sourceEffectiveWidth"::DOUBLE PRECISION / NULLIF("sourceEffectiveHeight", 0) >= 1.1 THEN 'LANDSCAPE'::"ReelSourceOrientation"
        WHEN "sourceEffectiveWidth"::DOUBLE PRECISION / NULLIF("sourceEffectiveHeight", 0) <= 0.9 THEN 'PORTRAIT'::"ReelSourceOrientation"
        ELSE 'SQUARE'::"ReelSourceOrientation"
    END,
    "sourceLengthClass" = CASE
        WHEN "sourceDurationMs" IS NULL OR "sourceDurationMs" < 0 THEN NULL
        WHEN "sourceDurationMs" <= 180000 THEN 'SHORT'::"ReelSourceLengthClass"
        ELSE 'LONG'::"ReelSourceLengthClass"
    END;

CREATE INDEX "Reel_mediaStatus_idx" ON "Reel"("mediaStatus");
CREATE INDEX "Reel_indexStatus_idx" ON "Reel"("indexStatus");
CREATE INDEX "Reel_mediaStatus_visibility_createdAt_idx"
ON "Reel"("mediaStatus", "visibility", "createdAt" DESC);
CREATE INDEX "Reel_mediaAttemptId_idx" ON "Reel"("mediaAttemptId");
CREATE INDEX "Reel_indexAttemptId_idx" ON "Reel"("indexAttemptId");
