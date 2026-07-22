/**
 * TEMPORARY REFACTOR TEST
 * Remove during Phase 10 after production validation.
 */

import { ConfigService } from '@nestjs/config';
import {
  ReelSourceMediaValidationError,
  ValidateReelSourceMediaUseCase,
} from './validate-reel-source-media.use-case';

describe('ValidateReelSourceMediaUseCase Phase 1 duration authority', () => {
  const useCase = new ValidateReelSourceMediaUseCase(
    new ConfigService({ MEDIA_LONG_MAX_DURATION_SECONDS: '7200' }),
  );
  const source = {
    width: 1920,
    height: 1080,
    fps: 30,
    codecName: 'h264',
    pixelFormat: 'yuv420p',
  };

  it('accepts ffprobe duration at the configured long-lane boundary', () => {
    expect(() =>
      useCase.execute({ ...source, durationMs: 7_200_000 }),
    ).not.toThrow();
  });

  it('rejects ffprobe duration above the configured long-lane boundary', () => {
    try {
      useCase.execute({ ...source, durationMs: 7_200_001 });
      throw new Error('Expected long source validation to fail');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ReelSourceMediaValidationError);
      expect((error as ReelSourceMediaValidationError).errorCode).toBe(
        'VIDEO_TOO_LONG',
      );
    }
  });
});
