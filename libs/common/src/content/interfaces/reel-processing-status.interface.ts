import type { ReelVisibility } from '@common/content/schemas/reel-visibility.schema';
import type {
  LegacyReelStatus,
  ReelIndexStatus,
  ReelMediaStatus,
} from '@common/content/interfaces/reel-state.interface';

export interface ReelProcessingStatus {
  reelId: string;
  userId?: string;
  visibility?: ReelVisibility;
  status: LegacyReelStatus | 'NOT_FOUND';
  mediaStatus?: ReelMediaStatus;
  indexStatus?: ReelIndexStatus;
  stage?: string;
  message?: string;
  progress?: number;
  mediaKey?: string;
  thumbnailKey?: string;
}
