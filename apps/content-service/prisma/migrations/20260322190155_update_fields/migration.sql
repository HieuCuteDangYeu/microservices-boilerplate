/*
  Warnings:

  - You are about to drop the column `mediaId` on the `Reel` table. All the data in the column will be lost.
  - You are about to drop the column `mediaUrl` on the `Reel` table. All the data in the column will be lost.
  - Added the required column `mediaKey` to the `Reel` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Reel" DROP COLUMN "mediaId",
DROP COLUMN "mediaUrl",
ADD COLUMN     "mediaKey" TEXT NOT NULL;
