/*
  Warnings:

  - The values [PROJECT] on the enum `UserMemoryType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "UserMemoryType_new" AS ENUM ('PREFERENCE', 'PROFILE', 'TECHNICAL_CONTEXT', 'COMMUNICATION_STYLE', 'OTHER');
ALTER TABLE "UserMemory" ALTER COLUMN "type" TYPE "UserMemoryType_new" USING ("type"::text::"UserMemoryType_new");
ALTER TYPE "UserMemoryType" RENAME TO "UserMemoryType_old";
ALTER TYPE "UserMemoryType_new" RENAME TO "UserMemoryType";
DROP TYPE "UserMemoryType_old";
COMMIT;
