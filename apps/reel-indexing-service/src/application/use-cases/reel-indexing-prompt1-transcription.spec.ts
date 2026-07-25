/**
 * TEMPORARY REEL INDEXING/RETRIEVAL MIGRATION TEST
 * Remove only after production validation.
 */

import type { ReelIndexJob } from '@common/processing/interfaces/reel-index-job.interface';
import type { AudioSegmentCheckpoint } from '@indexing/domain/entities/index-checkpoint.entity';
import { ConfigService } from '@nestjs/config';
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
  sourceDurationMs: 20_000,
  sourceHasAudio: true,
  sourceOrientation: 'PORTRAIT',
  sourceLengthClass: 'SHORT',
  tags: [],
  createdAt: '2026-07-25T00:00:00.000Z',
  schemaVersion: 1,
};

const completedSegment = (
  segmentNumber: number,
  text: string,
  status: AudioSegmentCheckpoint['status'] = 'COMPLETED',
): AudioSegmentCheckpoint => ({
  indexAttemptId: job.indexAttemptId,
  segmentNumber,
  artifactKey: `audio/${segmentNumber}.wav`,
  artifactChecksum: `checksum-${segmentNumber}`,
  startMs: segmentNumber * 10_000,
  endMs: segmentNumber * 10_000 + 12_000,
  overlapBeforeMs: segmentNumber ? 2_000 : 0,
  status,
  attemptCount: status === 'COMPLETED' ? 1 : 0,
  transcriptText: text,
  transcriptSegments: [{ id: 1, start: 0, end: 2, text }],
});

describe('Prompt 1 transcript durability', () => {
  it('merges ordered segments and records evidence lineage', () => {
    const result = new MergeTranscriptSegmentsUseCase().execute(
      [completedSegment(1, 'second'), completedSegment(0, 'first')],
      2,
    );
    expect(result.text).toBe('first second');
    expect(result.segments).toEqual([
      expect.objectContaining({
        sourceSegmentId: 'transcription:0:1',
        sourceAudioArtifactId: 'checksum-0',
      }),
      expect.objectContaining({
        sourceSegmentId: 'transcription:1:1',
        sourceAudioArtifactId: 'checksum-1',
      }),
    ]);
  });

  it('deduplicates transcript overlap deterministically on replay', () => {
    const useCase = new MergeTranscriptSegmentsUseCase();
    const segments = [
      completedSegment(0, 'the quick brown fox jumps'),
      completedSegment(1, 'brown fox jumps over the dog'),
    ];
    expect(useCase.execute(segments, 2).text).toBe(
      'the quick brown fox jumps over the dog',
    );
    expect(useCase.execute(segments, 2)).toEqual(useCase.execute(segments, 2));
  });

  it('rejects a partial long transcription before merge', () => {
    expect(() =>
      new MergeTranscriptSegmentsUseCase().execute(
        [completedSegment(0, 'first')],
        2,
      ),
    ).toThrow(MissingAudioSegmentsError);
  });

  it('reuses completed transcription segments and retries only pending work', async () => {
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
    let segments = [
      completedSegment(0, 'checkpointed'),
      completedSegment(1, '', 'PENDING'),
    ];
    const ai = {
      transcribeAudioKey: jest.fn().mockResolvedValue({
        text: 'retried',
        segments: [{ start: 0, end: 1, text: 'retried' }],
        provider: 'test',
        model: 'test-model',
        version: '1',
      }),
    };
    const checkpoints = {
      initializeAudioSegments: jest.fn(),
      listAudioSegments: jest.fn(() => Promise.resolve([...segments])),
      markAudioSegmentProcessing: jest.fn(),
      completeAudioSegment: jest.fn((value: AudioSegmentCheckpoint) => {
        segments = segments.map((segment) =>
          segment.segmentNumber === value.segmentNumber ? value : segment,
        );
        return Promise.resolve();
      }),
      failAudioSegment: jest.fn(),
    };
    const useCase = new TranscribeAudioManifestUseCase(
      new ConfigService(),
      { getTranscriptionAudioManifest: jest.fn().mockResolvedValue(manifest) },
      ai as never,
      checkpoints as never,
    );
    await useCase.execute(job);
    expect(ai.transcribeAudioKey).toHaveBeenCalledTimes(1);
    expect(ai.transcribeAudioKey).toHaveBeenCalledWith(
      expect.objectContaining({ audioKey: 'audio/1.wav' }),
    );
  });
});
