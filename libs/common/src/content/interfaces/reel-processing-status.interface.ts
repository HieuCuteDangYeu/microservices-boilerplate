import type { ReelVisibility } from '@common/content/schemas/reel-visibility.schema';

export interface ReelProcessingStatus {
  reelId: string;
  userId?: string;
  visibility?: ReelVisibility;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'NOT_FOUND';
  stage?: string;
  message?: string;
  progress?: number;
  mediaKey?: string;
  thumbnailKey?: string;
}
