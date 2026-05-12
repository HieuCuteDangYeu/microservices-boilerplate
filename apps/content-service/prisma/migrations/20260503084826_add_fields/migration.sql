-- AlterTable
ALTER TABLE "Reel" ADD COLUMN     "thumbnailKey" TEXT,
ADD COLUMN     "viewCount" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "visibility" TEXT NOT NULL DEFAULT 'public';

-- CreateIndex
CREATE INDEX "Reel_visibility_createdAt_idx" ON "Reel"("visibility", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Reel_userId_visibility_createdAt_idx" ON "Reel"("userId", "visibility", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Reel_status_idx" ON "Reel"("status");
