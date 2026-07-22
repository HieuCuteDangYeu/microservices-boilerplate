/**
 * TEMPORARY REFACTOR TEST
 * Remove during Phase 10 after production validation.
 */

import { ConfigService } from '@nestjs/config';
import type { VideoMetadata } from '../../domain/interfaces/video-processing.service.interface';
import { buildHlsTranscodeArguments } from '../../infrastructure/services/ffmpeg-arguments';
import { BuildTranscriptionAudioManifestUseCase } from './build-transcription-audio-manifest.use-case';
import { SelectReelEncodingProfileUseCase } from './select-reel-encoding-profile.use-case';
import {
  ReelSourceMediaValidationError,
  ValidateReelSourceMediaUseCase,
} from './validate-reel-source-media.use-case';

const baseMetadata: VideoMetadata = {
  durationMs: 30_000,
  width: 1080,
  height: 1920,
  fps: 30,
  bitrateKbps: 8_000,
  codecName: 'h264',
  pixelFormat: 'yuv420p',
  audioCodecName: 'aac',
  hasAudio: true,
  rotation: 0,
  fileSizeBytes: 20_000_000,
  isVariableFrameRate: false,
};

describe('Phase 3 media matrix', () => {
  const config = new ConfigService({
    MEDIA_LONG_MAX_DURATION_SECONDS: '7200',
    MEDIA_ALLOW_1080P: 'false',
    MEDIA_ALLOW_60FPS: 'false',
  });
  const selectProfile = new SelectReelEncodingProfileUseCase(config);
  const validate = new ValidateReelSourceMediaUseCase(config);

  it.each([
    [
      'portrait',
      { width: 1080, height: 1920, rotation: 0 },
      [
        [360, 640],
        [540, 960],
        [720, 1280],
      ],
    ],
    [
      'landscape',
      { width: 1920, height: 1080, rotation: 0 },
      [
        [640, 360],
        [960, 540],
        [1280, 720],
      ],
    ],
    [
      'square',
      { width: 1080, height: 1080, rotation: 0 },
      [
        [360, 360],
        [540, 540],
        [720, 720],
      ],
    ],
    [
      'rotated portrait',
      { width: 1920, height: 1080, rotation: 90 },
      [
        [360, 640],
        [540, 960],
        [720, 1280],
      ],
    ],
  ] as const)(
    'selects the %s ladder without upscaling',
    (_name, dimensions, expected) => {
      const profile = selectProfile.execute({ ...baseMetadata, ...dimensions });

      expect(
        profile.variants.map(({ width, height }) => [width, height]),
      ).toEqual(expected);
      expect(
        profile.variants.every(
          ({ width, height }) => width % 2 === 0 && height % 2 === 0,
        ),
      ).toBe(true);
    },
  );

  it('uses an even source-sized fallback instead of upscaling', () => {
    const profile = selectProfile.execute({
      ...baseMetadata,
      width: 319,
      height: 567,
    });

    expect(profile.variants).toHaveLength(1);
    expect(profile.variants[0]).toMatchObject({ width: 318, height: 566 });
  });

  it('enables the 1080p variant and 60 FPS only when configured', () => {
    const optInProfile = new SelectReelEncodingProfileUseCase(
      new ConfigService({
        MEDIA_HLS_QUALITY_PROFILE: 'high',
        MEDIA_HLS_MAX_VARIANTS: '4',
        MEDIA_ALLOW_1080P: 'true',
        MEDIA_ALLOW_60FPS: 'true',
      }),
    ).execute({ ...baseMetadata, fps: 60 });

    expect(optInProfile.variants.at(-1)).toMatchObject({
      name: '1080p',
      width: 1080,
      height: 1920,
    });
    expect(optInProfile.outputFps).toBe(60);
  });

  it('selects the long HLS segment duration and a duration-derived timeout', () => {
    const shortProfile = selectProfile.execute(baseMetadata);
    const longProfile = selectProfile.execute({
      ...baseMetadata,
      durationMs: 7_200_000,
    });

    expect(shortProfile.segmentSeconds).toBe(2);
    expect(longProfile.segmentSeconds).toBe(4);
    expect(longProfile.timeoutMs).toBeGreaterThan(shortProfile.timeoutMs);
  });

  it.each([24, 25, 30, 50, 60])('accepts %s FPS source media', (fps) => {
    expect(() => validate.execute({ ...baseMetadata, fps })).not.toThrow();
  });

  it.each([
    ['portrait', {}],
    ['landscape', { width: 1920, height: 1080 }],
    ['square', { width: 1080, height: 1080 }],
    ['rotation metadata', { width: 1920, height: 1080, rotation: 90 }],
    ['no audio', { hasAudio: false, audioCodecName: undefined }],
    ['variable frame rate', { isVariableFrameRate: true, fps: 29.97 }],
    ['configured long form', { durationMs: 7_200_000 }],
  ])('accepts %s media', (_name, patch) => {
    expect(() => validate.execute({ ...baseMetadata, ...patch })).not.toThrow();
  });

  it.each([
    ['VIDEO_METADATA_UNREADABLE', { durationMs: 0 }],
    ['VIDEO_METADATA_UNREADABLE', { width: 0 }],
    ['VIDEO_CODEC_UNREADABLE', { codecName: '' }],
    ['VIDEO_CODEC_UNREADABLE', { pixelFormat: '' }],
    ['VIDEO_FRAME_RATE_UNREADABLE', { fps: 0 }],
    ['VIDEO_BITRATE_TOO_HIGH', { bitrateKbps: 100_001 }],
    ['VIDEO_FILE_TOO_LARGE', { fileSizeBytes: 20_481 * 1024 * 1024 }],
  ] as const)('rejects invalid source metadata with %s', (code, patch) => {
    expect(() => validate.execute({ ...baseMetadata, ...patch })).toThrow(
      expect.objectContaining({
        errorCode: code,
      }) as ReelSourceMediaValidationError,
    );
  });

  it('rejects processing when the temporary disk estimate is unavailable', () => {
    expect(() =>
      validate.execute(baseMetadata, {
        availableTempBytes: 999,
        estimatedAdditionalTempBytes: 1_000,
      }),
    ).toThrow(
      expect.objectContaining({
        errorCode: 'INSUFFICIENT_TEMP_STORAGE',
      }) as ReelSourceMediaValidationError,
    );
  });
});

describe('Phase 3 FFmpeg argument arrays', () => {
  const selectProfile = new SelectReelEncodingProfileUseCase(
    new ConfigService({ MEDIA_ALLOW_1080P: 'false' }),
  );

  it.each([
    ['portrait', { width: 1080, height: 1920 }],
    ['landscape', { width: 1920, height: 1080 }],
    ['square', { width: 1080, height: 1080 }],
  ])('preserves aspect ratio for %s inputs', (_name, dimensions) => {
    const args = buildHlsTranscodeArguments({
      inputPath: '/tmp/source.mp4',
      outputDir: '/tmp/hls',
      profile: selectProfile.execute({ ...baseMetadata, ...dimensions }),
    });
    const filter = args[args.indexOf('-filter_complex') + 1];

    expect(args).toEqual(
      expect.arrayContaining([
        '-hls_segment_filename',
        '/tmp/hls/%v/segment_%06d.ts',
      ]),
    );
    expect(filter).toContain('force_original_aspect_ratio=decrease');
    expect(filter).toContain('force_divisible_by=2');
    expect(filter).toContain('setsar=1');
    expect(filter).not.toContain('crop=');
    expect(filter).not.toContain('force_original_aspect_ratio=increase');
  });

  it('omits audio mappings for a no-audio source', () => {
    const args = buildHlsTranscodeArguments({
      inputPath: '/tmp/source.mp4',
      outputDir: '/tmp/hls',
      profile: selectProfile.execute({ ...baseMetadata, hasAudio: false }),
    });

    expect(args).not.toContain('0:a:0');
    expect(args).not.toContain('-c:a');
  });
});

describe('Phase 3 long-form transcription segmentation', () => {
  const useCase = new BuildTranscriptionAudioManifestUseCase(
    new ConfigService({
      MEDIA_TRANSCRIPTION_SEGMENT_SECONDS: '300',
      MEDIA_TRANSCRIPTION_SEGMENT_OVERLAP_SECONDS: '2',
    }),
    {} as never,
    {} as never,
    {} as never,
  );

  it('plans a two-hour source without loading a fixture', () => {
    const segments = useCase.planSegments(7_200_000, '/tmp/audio', 'wav');

    expect(segments).toHaveLength(24);
    expect(segments[0]).toMatchObject({
      startMs: 0,
      endMs: 300_000,
      overlapBeforeMs: 0,
    });
    expect(segments[1]).toMatchObject({
      startMs: 298_000,
      endMs: 600_000,
      overlapBeforeMs: 2_000,
    });
    expect(segments[23]).toMatchObject({
      startMs: 6_898_000,
      endMs: 7_200_000,
      overlapBeforeMs: 2_000,
    });
    expect(segments[23].outputPath.endsWith('audio_000023.wav')).toBe(true);
  });

  it('plans one artifact for a short source', () => {
    expect(useCase.planSegments(30_000, '/tmp/audio', 'wav')).toEqual([
      expect.objectContaining({
        startMs: 0,
        endMs: 30_000,
        overlapBeforeMs: 0,
      }),
    ]);
  });

  it('uploads an empty manifest without extracting audio for a no-audio source', async () => {
    const extract = jest.fn();
    const uploadTextObject = jest.fn().mockResolvedValue({
      key: 'reels/reel-1/transcription/attempt-1/manifest.json',
      checksum: 'manifest-checksum',
      byteLength: 128,
    });
    const noAudioUseCase = new BuildTranscriptionAudioManifestUseCase(
      new ConfigService(),
      { extractTranscriptionAudioSegments: extract } as never,
      { uploadTextObject } as never,
      {} as never,
    );

    const result = await noAudioUseCase.execute({
      reelId: 'reel-1',
      mediaAttemptId: 'attempt-1',
      inputPath: '/tmp/source.mp4',
      outputDir: '/tmp/audio',
      storagePrefix: 'reels/reel-1',
      metadata: { ...baseMetadata, hasAudio: false },
    });

    expect(extract).not.toHaveBeenCalled();
    expect(result.manifest.artifacts).toEqual([]);
    expect(result.manifest.version).toBe(1);
    expect(uploadTextObject).toHaveBeenCalledWith(
      'reels/reel-1/transcription/attempt-1/manifest.json',
      expect.any(String),
      'application/json',
    );
  });
});
