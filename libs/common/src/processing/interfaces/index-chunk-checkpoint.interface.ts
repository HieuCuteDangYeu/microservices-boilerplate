export interface IndexChunkCheckpoint {
  chunkIndex: number;
  text: string;
  startTime?: number;
  endTime?: number;
  embedding: number[];
  embeddingModel: string;
}
