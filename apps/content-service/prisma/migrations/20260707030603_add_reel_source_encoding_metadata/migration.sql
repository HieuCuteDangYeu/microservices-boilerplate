-- AlterTable
ALTER TABLE "Reel" ADD COLUMN     "encodedFps" INTEGER,
ADD COLUMN     "encodedMaxHeight" INTEGER,
ADD COLUMN     "encodedVariantCount" INTEGER,
ADD COLUMN     "sourceBitrateKbps" INTEGER,
ADD COLUMN     "sourceDurationMs" INTEGER,
ADD COLUMN     "sourceFps" DOUBLE PRECISION,
ADD COLUMN     "sourceHasAudio" BOOLEAN,
ADD COLUMN     "sourceHeight" INTEGER,
ADD COLUMN     "sourceRotation" INTEGER,
ADD COLUMN     "sourceWidth" INTEGER;
