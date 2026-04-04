-- Create the pgvector extension first
CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable
ALTER TABLE "Reel" ADD COLUMN     "embedding" vector(384),
ADD COLUMN     "transcript" TEXT;