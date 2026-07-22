/**
 * TEMPORARY REFACTOR TEST
 * Remove during Phase 10 after production validation.
 */

import { ConfigService } from '@nestjs/config';
import { ClassifyReelMediaUseCase } from './classify-reel-media.use-case';

describe('ClassifyReelMediaUseCase', () => {
  const useCase = new ClassifyReelMediaUseCase(
    new ConfigService({ MEDIA_SHORT_MAX_DURATION_SECONDS: '180' }),
  );

  it.each([
    [1920, 1080, 0, 'LANDSCAPE'],
    [1080, 1920, 0, 'PORTRAIT'],
    [1080, 1080, 0, 'SQUARE'],
  ] as const)(
    'classifies %sx%s rotation %s as %s',
    (width, height, rotation, expected) => {
      expect(
        useCase.execute({ width, height, rotation, durationMs: 30_000 }),
      ).toMatchObject({ orientation: expected, mediaClass: 'SHORT' });
    },
  );

  it('uses rotation-adjusted dimensions and ratio', () => {
    expect(
      useCase.execute({
        width: 1920,
        height: 1080,
        rotation: 90,
        durationMs: 30_000,
      }),
    ).toEqual({
      orientation: 'PORTRAIT',
      mediaClass: 'SHORT',
      effectiveWidth: 1080,
      effectiveHeight: 1920,
      aspectRatio: 0.5625,
    });
  });

  it.each([
    [180_000, 'SHORT'],
    [180_001, 'LONG'],
  ] as const)(
    'classifies duration %sms as %s at the short/long boundary',
    (durationMs, expected) => {
      expect(
        useCase.execute({
          width: 1920,
          height: 1080,
          durationMs,
        }),
      ).toMatchObject({ mediaClass: expected });
    },
  );
});
