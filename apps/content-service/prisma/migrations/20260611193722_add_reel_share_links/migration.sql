-- CreateTable
CREATE TABLE "ReelShareLink" (
    "id" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "clickCount" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReelShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReelShareLink_token_key" ON "ReelShareLink"("token");

-- CreateIndex
CREATE INDEX "ReelShareLink_reelId_idx" ON "ReelShareLink"("reelId");

-- CreateIndex
CREATE INDEX "ReelShareLink_ownerId_idx" ON "ReelShareLink"("ownerId");

-- CreateIndex
CREATE INDEX "ReelShareLink_createdBy_idx" ON "ReelShareLink"("createdBy");

-- CreateIndex
CREATE INDEX "ReelShareLink_expiresAt_idx" ON "ReelShareLink"("expiresAt");

-- CreateIndex
CREATE INDEX "ReelShareLink_revokedAt_idx" ON "ReelShareLink"("revokedAt");

-- AddForeignKey
ALTER TABLE "ReelShareLink" ADD CONSTRAINT "ReelShareLink_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
