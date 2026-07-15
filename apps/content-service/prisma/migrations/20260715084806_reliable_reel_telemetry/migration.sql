/*
  Warnings:

  - The primary key for the `ReelViewEvent` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `createdAt` on the `ReelViewEvent` table. All the data in the column will be lost.
  - You are about to drop the column `id` on the `ReelViewEvent` table. All the data in the column will be lost.
  - You are about to drop the column `sessionId` on the `ReelViewEvent` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userId,reelId,playbackSessionId,sequence]` on the table `ReelViewEvent` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `eventId` to the `ReelViewEvent` table without a default value. This is not possible if the table is not empty.
  - Added the required column `occurredAt` to the `ReelViewEvent` table without a default value. This is not possible if the table is not empty.
  - Added the required column `playbackSessionId` to the `ReelViewEvent` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sequence` to the `ReelViewEvent` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `eventType` on the `ReelViewEvent` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Made the column `completed` on table `ReelViewEvent` required. This step will fail if there are existing NULL values in that column.
  - Made the column `replayed` on table `ReelViewEvent` required. This step will fail if there are existing NULL values in that column.
  - Made the column `skipped` on table `ReelViewEvent` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "ReelViewEventType" AS ENUM ('IMPRESSION', 'WATCH_START', 'WATCH_PROGRESS', 'WATCH_END', 'SKIP', 'COMPLETE', 'REPLAY', 'PAUSE', 'RESUME', 'MUTE', 'UNMUTE');

-- CreateEnum
CREATE TYPE "ReelEventSource" AS ENUM ('RECOMMENDED', 'PUBLIC_FEED', 'PROFILE', 'SEARCH', 'SHARED', 'DIRECT', 'UNKNOWN');

-- DropIndex
DROP INDEX "ReelViewEvent_createdAt_idx";

-- DropIndex
DROP INDEX "ReelViewEvent_eventType_idx";

-- DropIndex
DROP INDEX "ReelViewEvent_reelId_idx";

-- DropIndex
DROP INDEX "ReelViewEvent_userId_createdAt_idx";

-- DropIndex
DROP INDEX "ReelViewEvent_userId_idx";

-- DropIndex
DROP INDEX "ReelViewEvent_userId_reelId_createdAt_idx";

-- AlterTable
ALTER TABLE "ReelViewEvent" DROP CONSTRAINT "ReelViewEvent_pkey",
DROP COLUMN "createdAt",
DROP COLUMN "id",
DROP COLUMN "sessionId",
ADD COLUMN     "algorithmVersion" TEXT,
ADD COLUMN     "candidateSource" TEXT,
ADD COLUMN     "eventId" TEXT NOT NULL,
ADD COLUMN     "feedSessionId" TEXT,
ADD COLUMN     "occurredAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "playbackSessionId" TEXT NOT NULL,
ADD COLUMN     "rank" INTEGER,
ADD COLUMN     "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "recommendationGeneratedAt" TIMESTAMP(3),
ADD COLUMN     "recommendationId" TEXT,
ADD COLUMN     "sequence" INTEGER NOT NULL,
ADD COLUMN     "source" "ReelEventSource" NOT NULL DEFAULT 'UNKNOWN',
DROP COLUMN "eventType",
ADD COLUMN     "eventType" "ReelViewEventType" NOT NULL,
ALTER COLUMN "completed" SET NOT NULL,
ALTER COLUMN "completed" SET DEFAULT false,
ALTER COLUMN "replayed" SET NOT NULL,
ALTER COLUMN "replayed" SET DEFAULT false,
ALTER COLUMN "skipped" SET NOT NULL,
ALTER COLUMN "skipped" SET DEFAULT false,
ADD CONSTRAINT "ReelViewEvent_pkey" PRIMARY KEY ("eventId");

-- CreateTable
CREATE TABLE "ReelViewSession" (
    "userId" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,
    "playbackSessionId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReelViewSession_pkey" PRIMARY KEY ("userId","reelId","playbackSessionId")
);

-- CreateIndex
CREATE INDEX "ReelViewSession_reelId_startedAt_idx" ON "ReelViewSession"("reelId", "startedAt");

-- CreateIndex
CREATE INDEX "ReelViewSession_userId_startedAt_idx" ON "ReelViewSession"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "ReelViewSession_createdAt_idx" ON "ReelViewSession"("createdAt");

-- CreateIndex
CREATE INDEX "ReelViewEvent_reelId_occurredAt_idx" ON "ReelViewEvent"("reelId", "occurredAt");

-- CreateIndex
CREATE INDEX "ReelViewEvent_userId_occurredAt_idx" ON "ReelViewEvent"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "ReelViewEvent_userId_reelId_occurredAt_idx" ON "ReelViewEvent"("userId", "reelId", "occurredAt");

-- CreateIndex
CREATE INDEX "ReelViewEvent_userId_playbackSessionId_occurredAt_idx" ON "ReelViewEvent"("userId", "playbackSessionId", "occurredAt");

-- CreateIndex
CREATE INDEX "ReelViewEvent_eventType_occurredAt_idx" ON "ReelViewEvent"("eventType", "occurredAt");

-- CreateIndex
CREATE INDEX "ReelViewEvent_source_occurredAt_idx" ON "ReelViewEvent"("source", "occurredAt");

-- CreateIndex
CREATE INDEX "ReelViewEvent_feedSessionId_idx" ON "ReelViewEvent"("feedSessionId");

-- CreateIndex
CREATE INDEX "ReelViewEvent_recommendationId_idx" ON "ReelViewEvent"("recommendationId");

-- CreateIndex
CREATE INDEX "ReelViewEvent_receivedAt_idx" ON "ReelViewEvent"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReelViewEvent_userId_reelId_playbackSessionId_sequence_key" ON "ReelViewEvent"("userId", "reelId", "playbackSessionId", "sequence");

-- AddForeignKey
ALTER TABLE "ReelViewSession" ADD CONSTRAINT "ReelViewSession_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
