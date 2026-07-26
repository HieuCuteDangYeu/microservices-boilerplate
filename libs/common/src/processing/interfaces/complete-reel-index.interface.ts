export interface CompleteReelIndexCommand {
  reelId: string;
  indexAttemptId: string;
  indexVersion: string;
  reelDocumentCount: number;
  sectionCount: number;
  chunkCount: number;
  embeddingProvider: string;
  embeddingModel: string;
  embeddingDimensions: number;
  embeddingVersion: string;
  indexedAt: string;
}
