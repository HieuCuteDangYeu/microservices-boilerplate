export class Reel {
  id: string;
  userId: string;
  mediaKey: string;
  title?: string;
  description?: string;
  tags: string[];
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  transcript?: string;
  embedding?: number[];
  createdAt: Date;
  updatedAt: Date;
}
