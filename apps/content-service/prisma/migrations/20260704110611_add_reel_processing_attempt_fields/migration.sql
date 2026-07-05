-- AlterTable
ALTER TABLE "Reel" ADD COLUMN     "processingAttemptId" TEXT,
ADD COLUMN     "processingCompletedAt" TIMESTAMP(3),
ADD COLUMN     "processingErrorCode" TEXT,
ADD COLUMN     "processingErrorDetail" TEXT,
ADD COLUMN     "processingFailedAt" TIMESTAMP(3),
ADD COLUMN     "processingStartedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Reel_processingAttemptId_idx" ON "Reel"("processingAttemptId");

-- CreateIndex
CREATE INDEX "Reel_status_processingStartedAt_idx" ON "Reel"("status", "processingStartedAt");
