export class ReelChunk {
  id: string;
  reelId: string;
  userId: string;
  chunkIndex: number;
  text: string;
  startTime?: number;
  endTime?: number;
  embedding?: number[];
  embeddingModel: string;
  createdAt: Date;
}
