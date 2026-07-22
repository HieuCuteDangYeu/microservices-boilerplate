/**
 * TEMPORARY REFACTOR TEST
 * Remove during Phase 10 after production validation.
 */

import { ConfigService } from '@nestjs/config';
import {
  getPrimaryQueuesForWorkerLane,
  getReelMediaPrimaryQueue,
  REEL_MEDIA_QUEUE_NAMES,
} from '@common/processing/reel-media-queue.constants';
import { ClassifyReelJobLengthUseCase } from './classify-reel-job-length.use-case';

describe('ClassifyReelJobLengthUseCase', () => {
  const useCase = new ClassifyReelJobLengthUseCase(
    new ConfigService({
      MEDIA_SHORT_MAX_DURATION_SECONDS: '180',
      MEDIA_LONG_MAX_DURATION_SECONDS: '7200',
    }),
  );

  it.each([
    [undefined, 'UNKNOWN'],
    [180_000, 'SHORT'],
    [180_001, 'LONG'],
    [7_200_001, 'UNKNOWN'],
  ] as const)('classifies duration %s as %s', (durationMs, expected) => {
    expect(useCase.execute(durationMs)).toBe(expected);
  });

  it('routes short and long jobs to independent primary queues', () => {
    expect(getReelMediaPrimaryQueue('SHORT').queue).toBe(
      REEL_MEDIA_QUEUE_NAMES.SHORT_JOBS,
    );
    expect(getReelMediaPrimaryQueue('LONG').queue).toBe(
      REEL_MEDIA_QUEUE_NAMES.LONG_JOBS,
    );
    expect(getReelMediaPrimaryQueue('UNKNOWN').queue).toBe(
      REEL_MEDIA_QUEUE_NAMES.LONG_JOBS,
    );
    expect(getPrimaryQueuesForWorkerLane('SHORT')).toHaveLength(1);
    expect(getPrimaryQueuesForWorkerLane('LONG')).toHaveLength(1);
  });
});
