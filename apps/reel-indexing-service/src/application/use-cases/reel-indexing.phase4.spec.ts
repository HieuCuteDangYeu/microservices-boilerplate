/**
 * TEMPORARY REFACTOR TEST
 * Remove during Phase 10 after production validation.
 */

import type { ReelIndexJob } from '@common/processing/interfaces/reel-index-job.interface';
import type { AudioSegmentCheckpoint } from '@indexing/domain/entities/index-checkpoint.entity';
import { ConfigService } from '@nestjs/config';
import { BuildTranscriptSectionsUseCase } from './build-transcript-sections.use-case';
import { ExtractHierarchicalMetadataUseCase } from './extract-hierarchical-metadata.use-case';
import {
  MergeTranscriptSegmentsUseCase,
  MissingAudioSegmentsError,
} from './merge-transcript-segments.use-case';
import { TranscribeAudioManifestUseCase } from './transcribe-audio-manifest.use-case';

const job: ReelIndexJob = {
  jobId: 'job-1',
  reelId: 'reel-1',
  userId: 'user-1',
  mediaAttemptId: 'media-1',
  indexAttemptId: 'index-1',
  indexVersion: 'v1',
  mediaKey: 'reels/source.mp4',
  transcriptionAudioManifestKey: 'reels/audio/manifest.json',
  sourceDurationMs: 120_000,
  sourceOrientation: 'PORTRAIT',
  sourceLengthClass: 'SHORT',
  tags: [],
  createdAt: '2026-07-22T00:00:00.000Z',
  schemaVersion: 1,
};

const completedSegment = (
  segmentNumber: number,
  text: string,
  startMs = segmentNumber * 10_000,
  endMs = startMs + 12_000,
): AudioSegmentCheckpoint => ({
  indexAttemptId: job.indexAttemptId,
  segmentNumber,
  artifactKey: `audio/${segmentNumber}.wav`,
  artifactChecksum: `checksum-${segmentNumber}`,
  startMs,
  endMs,
  overlapBeforeMs: segmentNumber ? 2_000 : 0,
  status: 'COMPLETED',
  attemptCount: 1,
  transcriptText: text,
  transcriptSegments: [{ start: 0, end: 2, text }],
});

describe('Phase 4 transcript merging', () => {
  const useCase = new MergeTranscriptSegmentsUseCase();

  it('merges one segment and offsets its timestamps', () => {
    expect(
      useCase.execute([completedSegment(0, 'hello world', 5_000)], 1),
    ).toEqual({
      text: 'hello world',
      segments: [
        expect.objectContaining({ start: 5, end: 7, text: 'hello world' }),
      ],
    });
  });

  it('keeps ordered segments ordered', () => {
    const result = useCase.execute(
      [
        completedSegment(0, 'first', 0, 9_000),
        completedSegment(1, 'second', 10_000, 19_000),
      ],
      2,
    );
    expect(result.text).toBe('first second');
    expect(result.segments?.map((segment) => segment.text)).toEqual([
      'first',
      'second',
    ]);
  });

  it('sorts out-of-order completed segments by segment number', () => {
    const result = useCase.execute(
      [
        completedSegment(1, 'second', 10_000, 19_000),
        completedSegment(0, 'first', 0, 9_000),
      ],
      2,
    );
    expect(result.text).toBe('first second');
  });

  it('removes deterministic suffix/prefix overlap', () => {
    const result = useCase.execute(
      [
        completedSegment(0, 'the quick brown fox jumps', 0, 12_000),
        completedSegment(1, 'brown fox jumps over the dog', 10_000, 20_000),
      ],
      2,
    );
    expect(result.text).toBe('the quick brown fox jumps over the dog');
  });

  it('reports missing completed segments', () => {
    expect(() => useCase.execute([completedSegment(0, 'first')], 2)).toThrow(
      MissingAudioSegmentsError,
    );
  });
});

describe('Phase 4 resumable audio transcription', () => {
  const manifest = {
    reelId: job.reelId,
    mediaAttemptId: job.mediaAttemptId,
    totalDurationMs: 20_000,
    format: 'wav' as const,
    version: 1 as const,
    artifacts: [0, 1].map((segmentNumber) => ({
      key: `audio/${segmentNumber}.wav`,
      startMs: segmentNumber * 10_000,
      endMs: segmentNumber * 10_000 + 12_000,
      overlapBeforeMs: segmentNumber ? 2_000 : 0,
      checksum: `checksum-${segmentNumber}`,
      byteLength: 100,
    })),
  };

  const setup = (initial: AudioSegmentCheckpoint[]) => {
    let segments = [...initial];
    const ai = {
      transcribeAudioKey: jest.fn().mockResolvedValue({
        text: 'retried text',
        segments: [{ start: 0, end: 1, text: 'retried text' }],
        provider: 'test',
        model: 'test-model',
        version: '1',
      }),
    };
    const checkpoints = {
      initializeAudioSegments: jest.fn().mockImplementation(() => {
        if (!segments.length) {
          segments = manifest.artifacts.map((artifact, segmentNumber) => ({
            ...completedSegment(segmentNumber, ''),
            artifactKey: artifact.key,
            status: 'PENDING' as const,
            attemptCount: 0,
            transcriptText: undefined,
          }));
        }
        return Promise.resolve();
      }),
      listAudioSegments: jest
        .fn()
        .mockImplementation(() => Promise.resolve([...segments])),
      markAudioSegmentProcessing: jest.fn(),
      completeAudioSegment: jest
        .fn()
        .mockImplementation((value: AudioSegmentCheckpoint) => {
          segments = segments.map((segment) =>
            segment.segmentNumber === value.segmentNumber ? value : segment,
          );
          return Promise.resolve();
        }),
      failAudioSegment: jest.fn(),
    };
    const useCase = new TranscribeAudioManifestUseCase(
      new ConfigService({ INDEX_TRANSCRIPTION_CONCURRENCY: '2' }),
      { getTranscriptionAudioManifest: jest.fn().mockResolvedValue(manifest) },
      ai as never,
      checkpoints as never,
    );
    return { useCase, ai, checkpoints };
  };

  it('transcribes a one-segment manifest', async () => {
    const oneSegmentManifest = {
      ...manifest,
      artifacts: manifest.artifacts.slice(0, 1),
    };
    const ai = {
      transcribeAudioKey: jest.fn().mockResolvedValue({ text: 'one' }),
    };
    const checkpoints = {
      initializeAudioSegments: jest.fn(),
      listAudioSegments: jest
        .fn()
        .mockResolvedValueOnce([
          { ...completedSegment(0, ''), status: 'PENDING', attemptCount: 0 },
        ])
        .mockResolvedValueOnce([completedSegment(0, 'one')]),
      markAudioSegmentProcessing: jest.fn(),
      completeAudioSegment: jest.fn(),
      failAudioSegment: jest.fn(),
    };
    const useCase = new TranscribeAudioManifestUseCase(
      new ConfigService(),
      {
        getTranscriptionAudioManifest: jest
          .fn()
          .mockResolvedValue(oneSegmentManifest),
      },
      ai as never,
      checkpoints as never,
    );
    await useCase.execute(job);
    expect(ai.transcribeAudioKey).toHaveBeenCalledTimes(1);
  });

  it('retries only a failed segment', async () => {
    const { useCase, ai } = setup([
      completedSegment(0, 'already complete'),
      { ...completedSegment(1, ''), status: 'FAILED', attemptCount: 1 },
    ]);
    await useCase.execute(job);
    expect(ai.transcribeAudioKey).toHaveBeenCalledTimes(1);
    expect(ai.transcribeAudioKey).toHaveBeenCalledWith(
      expect.objectContaining({ audioKey: 'audio/1.wav' }),
    );
  });

  it('resumes a long transcript after restart without resending successful segments', async () => {
    const { useCase, ai } = setup([
      completedSegment(0, 'checkpointed'),
      { ...completedSegment(1, ''), status: 'PENDING', attemptCount: 0 },
    ]);
    await useCase.execute(job);
    expect(ai.transcribeAudioKey).not.toHaveBeenCalledWith(
      expect.objectContaining({ audioKey: 'audio/0.wav' }),
    );
  });

  it('skips storage and AI when the job has no audio manifest', async () => {
    const storage = { getTranscriptionAudioManifest: jest.fn() };
    const ai = { transcribeAudioKey: jest.fn() };
    const useCase = new TranscribeAudioManifestUseCase(
      new ConfigService(),
      storage,
      ai as never,
      {} as never,
    );
    await expect(
      useCase.execute({ ...job, transcriptionAudioManifestKey: undefined }),
    ).resolves.toEqual({ segments: [] });
    expect(storage.getTranscriptionAudioManifest).not.toHaveBeenCalled();
    expect(ai.transcribeAudioKey).not.toHaveBeenCalled();
  });
});

describe('Phase 4 metadata hierarchy', () => {
  it('summarizes bounded sections before the final metadata extraction', async () => {
    const ai = {
      extractReelMetadata: jest
        .fn()
        .mockResolvedValueOnce({ description: 'summary one', tags: [] })
        .mockResolvedValueOnce({ description: 'summary two', tags: [] })
        .mockResolvedValueOnce({
          title: 'final',
          description: 'rollup',
          tags: ['tag'],
        }),
    };
    const useCase = new ExtractHierarchicalMetadataUseCase(ai as never);
    const sections = new BuildTranscriptSectionsUseCase().execute(
      'a'.repeat(7_000),
    );
    const result = await useCase.execute(job, 'a'.repeat(7_000), sections);
    expect(ai.extractReelMetadata).toHaveBeenCalledTimes(3);
    expect(result.metadata.title).toBe('final');
    expect(result.sections.every((section) => Boolean(section.summary))).toBe(
      true,
    );
  });

  it('skips the LLM when user metadata is strong', async () => {
    const ai = { extractReelMetadata: jest.fn() };
    const useCase = new ExtractHierarchicalMetadataUseCase(ai as never);
    const strongJob = {
      ...job,
      title: 'Strong reel title',
      description:
        'A sufficiently detailed user description that explains the reel.',
      tags: ['one', 'two', 'three'],
    };
    const result = await useCase.execute(strongJob, 'transcript', []);
    expect(ai.extractReelMetadata).not.toHaveBeenCalled();
    expect(result.metadata).toEqual({
      title: strongJob.title,
      description: strongJob.description,
      tags: strongJob.tags,
    });
  });
});
