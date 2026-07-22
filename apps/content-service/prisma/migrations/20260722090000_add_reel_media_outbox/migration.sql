CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimToken" TEXT,
    "claimedAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OutboxEvent_publishedAt_nextAttemptAt_createdAt_idx"
ON "OutboxEvent"("publishedAt", "nextAttemptAt", "createdAt");

CREATE INDEX "OutboxEvent_claimToken_claimedAt_idx"
ON "OutboxEvent"("claimToken", "claimedAt");

CREATE INDEX "OutboxEvent_aggregateType_aggregateId_idx"
ON "OutboxEvent"("aggregateType", "aggregateId");
