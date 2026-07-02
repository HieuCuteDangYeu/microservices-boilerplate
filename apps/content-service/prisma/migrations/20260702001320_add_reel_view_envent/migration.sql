-- CreateTable
CREATE TABLE "ReelViewEvent" (
    "id" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "eventType" TEXT NOT NULL,
    "watchMs" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "percentageWatched" DOUBLE PRECISION,
    "muted" BOOLEAN,
    "completed" BOOLEAN,
    "replayed" BOOLEAN,
    "skipped" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReelViewEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReelViewEvent_reelId_idx" ON "ReelViewEvent"("reelId");

-- CreateIndex
CREATE INDEX "ReelViewEvent_userId_idx" ON "ReelViewEvent"("userId");

-- CreateIndex
CREATE INDEX "ReelViewEvent_eventType_idx" ON "ReelViewEvent"("eventType");

-- CreateIndex
CREATE INDEX "ReelViewEvent_createdAt_idx" ON "ReelViewEvent"("createdAt");

-- CreateIndex
CREATE INDEX "ReelViewEvent_userId_createdAt_idx" ON "ReelViewEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ReelViewEvent_userId_reelId_createdAt_idx" ON "ReelViewEvent"("userId", "reelId", "createdAt");

-- AddForeignKey
ALTER TABLE "ReelViewEvent" ADD CONSTRAINT "ReelViewEvent_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
