-- CreateTable
CREATE TABLE "ConversationMemory" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationMemory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConversationMemory_conversationId_key" ON "ConversationMemory"("conversationId");

-- CreateIndex
CREATE INDEX "ConversationMemory_userId_idx" ON "ConversationMemory"("userId");

-- CreateIndex
CREATE INDEX "ConversationMemory_updatedAt_idx" ON "ConversationMemory"("updatedAt");
