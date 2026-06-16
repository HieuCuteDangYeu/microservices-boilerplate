-- CreateTable
CREATE TABLE "RagTrace" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "intent" TEXT,
    "needsRetrieval" BOOLEAN NOT NULL DEFAULT false,
    "retrievedChunkIds" JSONB,
    "rerankedChunkIds" JSONB,
    "citations" JSONB,
    "answer" TEXT,
    "verifierPassed" BOOLEAN,
    "verifierConfidence" DOUBLE PRECISION,
    "verifierIssues" JSONB,
    "latencyMs" INTEGER,
    "nodeTimings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RagTrace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RagTrace_userId_idx" ON "RagTrace"("userId");

-- CreateIndex
CREATE INDEX "RagTrace_conversationId_idx" ON "RagTrace"("conversationId");

-- CreateIndex
CREATE INDEX "RagTrace_createdAt_idx" ON "RagTrace"("createdAt");
