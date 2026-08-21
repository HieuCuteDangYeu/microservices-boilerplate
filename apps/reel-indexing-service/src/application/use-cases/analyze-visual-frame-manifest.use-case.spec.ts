import type { ReelIndexJob } from '@common/processing/interfaces/reel-index-job.interface';
import type { IIndexingAiService } from '@indexing/domain/interfaces/ai-service.interface';
import type { IArtifactStorage } from '@indexing/domain/interfaces/artifact-storage.interface';
import type { IIndexingApplicationConfig } from '@indexing/domain/interfaces/indexing-application-config.interface';
import { AnalyzeVisualFrameManifestUseCase } from './analyze-visual-frame-manifest.use-case';

describe('AnalyzeVisualFrameManifestUseCase', () => {
  it('requests checksum-verified bytes and passes raw bytes to the AI domain port', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const configValues: Record<string, string> = {
      INDEX_VISUAL_ANALYSIS_ENABLED: 'true',
      INDEX_VISUAL_ANALYSIS_REQUIRED: 'false',
      INDEX_VISUAL_ANALYSIS_CONCURRENCY: '2',
    };
    const config: IIndexingApplicationConfig = {
      get: <T = string>(key: string) => configValues[key] as T | undefined,
    };
    const storage = {
      artifactExists: jest.fn().mockResolvedValue(true),
      getVisualFrameManifest: jest.fn().mockResolvedValue({
        reelId: 'reel-1',
        mediaAttemptId: 'media-attempt-1',
        totalDurationMs: 10_000,
        sampling: {
          periodicIntervalMs: 4_000,
          sceneThreshold: 0.35,
          dedupeWindowMs: 750,
          maxFrames: 24,
        },
        artifacts: [
          {
            key: 'reels/reel-1/visual/frame.jpg',
            timestampMs: 4_000,
            checksum: 'abc123',
            byteLength: 4,
            reason: 'PERIODIC',
          },
        ],
        version: 1,
      }),
      getVerifiedArtifactBytes: jest.fn().mockResolvedValue(bytes),
    } as unknown as jest.Mocked<IArtifactStorage>;
    const ai = {
      analyzeVisualFrame: jest.fn().mockResolvedValue({
        caption: 'A laptop screen',
        ocrText: 'VLR-9281',
        objects: ['laptop'],
        provider: 'cloudflare',
        model: 'vision-model',
        version: '1',
      }),
    } as unknown as jest.Mocked<IIndexingAiService>;
    const useCase = new AnalyzeVisualFrameManifestUseCase(config, storage, ai);
    const job = {
      reelId: 'reel-1',
      mediaAttemptId: 'media-attempt-1',
      mediaKey: 'reels/reel-1/source.mp4',
      visualFrameManifestKey: 'reels/reel-1/visual/manifest.json',
    } as ReelIndexJob;

    await expect(useCase.execute(job)).resolves.toEqual([
      expect.objectContaining({
        frameKey: 'reels/reel-1/visual/frame.jpg',
        timestampMs: 4_000,
        caption: 'A laptop screen',
        ocrText: 'VLR-9281',
      }),
    ]);

    expect(storage.getVerifiedArtifactBytes).toHaveBeenCalledWith({
      key: 'reels/reel-1/visual/frame.jpg',
      sha256: 'abc123',
    });
    expect(ai.analyzeVisualFrame).toHaveBeenCalledWith({
      imageBytes: bytes,
      mimeType: 'image/jpeg',
      timestampMs: 4_000,
    });
  });
});
