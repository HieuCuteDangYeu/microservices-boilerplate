-- CreateTable
CREATE TABLE "ReelChunk" (
    "id" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "startTime" DOUBLE PRECISION,
    "endTime" DOUBLE PRECISION,
    "embedding" vector(384),
    "embeddingModel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReelChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReelChunk_reelId_idx" ON "ReelChunk"("reelId");

-- CreateIndex
CREATE INDEX "ReelChunk_userId_idx" ON "ReelChunk"("userId");

-- CreateIndex
CREATE INDEX "ReelChunk_createdAt_idx" ON "ReelChunk"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReelChunk_reelId_chunkIndex_key" ON "ReelChunk"("reelId", "chunkIndex");

-- AddForeignKey
ALTER TABLE "ReelChunk" ADD CONSTRAINT "ReelChunk_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
