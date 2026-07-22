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
    [1920, 1080, 90, 'PORTRAIT'],
  ] as const)(
    'classifies %sx%s rotation %s as %s',
    (width, height, rotation, expected) => {
      expect(
        useCase.execute({ width, height, rotation, durationMs: 30_000 }),
      ).toMatchObject({ orientation: expected, mediaClass: 'SHORT' });
    },
  );

  it('classifies duration above the short boundary as long', () => {
    expect(
      useCase.execute({
        width: 1920,
        height: 1080,
        durationMs: 180_001,
      }),
    ).toMatchObject({ mediaClass: 'LONG' });
  });
});
