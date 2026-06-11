-- CreateTable
CREATE TABLE "ReelShare" (
    "id" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sharedByUserId" TEXT NOT NULL,
    "sharedWithUserId" TEXT,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReelShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReelShare_reelId_idx" ON "ReelShare"("reelId");

-- CreateIndex
CREATE INDEX "ReelShare_ownerId_idx" ON "ReelShare"("ownerId");

-- CreateIndex
CREATE INDEX "ReelShare_sharedByUserId_idx" ON "ReelShare"("sharedByUserId");

-- CreateIndex
CREATE INDEX "ReelShare_sharedWithUserId_idx" ON "ReelShare"("sharedWithUserId");

-- CreateIndex
CREATE INDEX "ReelShare_conversationId_idx" ON "ReelShare"("conversationId");

-- CreateIndex
CREATE INDEX "ReelShare_messageId_idx" ON "ReelShare"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "ReelShare_reelId_conversationId_key" ON "ReelShare"("reelId", "conversationId");

-- AddForeignKey
ALTER TABLE "ReelShare" ADD CONSTRAINT "ReelShare_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
