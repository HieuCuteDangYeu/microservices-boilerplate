export class Reel {
  id: string;
  userId: string;
  mediaKey: string;
  title?: string;
  description?: string;
  tags: string[];
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  visibility: 'public' | 'private';
  viewCount: bigint;
  transcript?: string;
  embedding?: number[];
  thumbnailKey?: string;
  processingStage?: string;
  processingMessage?: string;
  processingProgress?: number;
  createdAt: Date;
  updatedAt: Date;
}
