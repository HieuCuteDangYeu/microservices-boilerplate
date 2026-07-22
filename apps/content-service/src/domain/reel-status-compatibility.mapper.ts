import type {
  LegacyReelStatus,
  ReelIndexStatus,
  ReelMediaStatus,
} from '@common/content/interfaces/reel-state.interface';

export function mapReelLegacyStatus(input: {
  mediaStatus: ReelMediaStatus;
  indexStatus: ReelIndexStatus;
}): LegacyReelStatus {
  if (input.mediaStatus === 'COMPLETED') {
    return 'COMPLETED';
  }

  if (input.mediaStatus === 'FAILED') {
    return 'FAILED';
  }

  if (input.mediaStatus === 'PENDING') {
    return 'PENDING';
  }

  return 'PROCESSING';
}
