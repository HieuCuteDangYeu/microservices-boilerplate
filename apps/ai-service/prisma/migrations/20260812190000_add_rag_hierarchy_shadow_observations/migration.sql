CREATE TABLE "RagHierarchyShadowObservation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "queryText" TEXT NOT NULL,
    "retrievalMode" TEXT NOT NULL,
    "requiredEvidence" TEXT[] NOT NULL,
    "directChunkIds" JSONB NOT NULL,
    "hierarchicalChunkIds" JSONB NOT NULL,
    "directCount" INTEGER NOT NULL,
    "hierarchicalCount" INTEGER NOT NULL,
    "directMs" INTEGER NOT NULL,
    "hierarchicalMs" INTEGER NOT NULL,
    "overlapAtK" DOUBLE PRECISION NOT NULL,
    "jaccard" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RagHierarchyShadowObservation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RagHierarchyShadowObservation_conversationId_idx"
ON "RagHierarchyShadowObservation"("conversationId");

CREATE INDEX "RagHierarchyShadowObservation_createdAt_idx"
ON "RagHierarchyShadowObservation"("createdAt");
