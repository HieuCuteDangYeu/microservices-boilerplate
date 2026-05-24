export interface ReelProcessingStatus {
  reelId: string;
  userId?: string;
  visibility?: 'public' | 'private';
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'NOT_FOUND';
  stage?: string;
  message?: string;
  progress?: number;
  mediaKey?: string;
  thumbnailKey?: string;
}
