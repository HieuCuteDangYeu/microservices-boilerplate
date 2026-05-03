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
  createdAt: Date;
  updatedAt: Date;
}
