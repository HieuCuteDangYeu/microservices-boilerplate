/**
 * TEMPORARY REFACTOR TEST
 * Remove during Phase 10 after production validation.
 */

import type {
  ReelIndexStatus,
  ReelMediaStatus,
} from '@common/content/interfaces/reel-state.interface';
import { mapReelLegacyStatus } from './reel-status-compatibility.mapper';

describe('mapReelLegacyStatus Phase 2 compatibility', () => {
  it.each<
    [ReelMediaStatus, ReelIndexStatus, ReturnType<typeof mapReelLegacyStatus>]
  >([
    ['PENDING', 'NOT_REQUESTED', 'PENDING'],
    ['PROBING', 'NOT_REQUESTED', 'PROCESSING'],
    ['PROCESSING', 'PENDING', 'PROCESSING'],
    ['COMPLETED', 'PROCESSING', 'COMPLETED'],
    ['COMPLETED', 'DEGRADED', 'COMPLETED'],
    ['COMPLETED', 'FAILED', 'COMPLETED'],
    ['FAILED', 'NOT_REQUESTED', 'FAILED'],
  ])(
    'maps media %s and index %s to legacy %s',
    (mediaStatus, indexStatus, expected) => {
      expect(mapReelLegacyStatus({ mediaStatus, indexStatus })).toBe(expected);
    },
  );
});
