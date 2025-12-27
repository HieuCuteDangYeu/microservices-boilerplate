-- AlterTable
ALTER TABLE "User" ADD COLUMN     "picture" TEXT,
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "providerId" TEXT,
ALTER COLUMN "password" DROP NOT NULL;
