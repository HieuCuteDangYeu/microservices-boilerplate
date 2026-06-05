-- CreateEnum
CREATE TYPE "UserMemoryType" AS ENUM ('PREFERENCE', 'PROFILE', 'PROJECT', 'TECHNICAL_CONTEXT', 'COMMUNICATION_STYLE', 'OTHER');

-- CreateTable
CREATE TABLE "UserMemory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "UserMemoryType" NOT NULL,
    "content" TEXT NOT NULL,
    "normalizedContent" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "sourceConversationId" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserMemory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserMemory_userId_idx" ON "UserMemory"("userId");

-- CreateIndex
CREATE INDEX "UserMemory_type_idx" ON "UserMemory"("type");

-- CreateIndex
CREATE INDEX "UserMemory_updatedAt_idx" ON "UserMemory"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserMemory_userId_type_normalizedContent_key" ON "UserMemory"("userId", "type", "normalizedContent");
