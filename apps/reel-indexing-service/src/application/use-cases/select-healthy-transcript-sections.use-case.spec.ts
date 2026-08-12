import type { TranscriptSegment } from '@common/ai/interfaces/transcription-result.interface';
import type { TranscriptSection } from '@indexing/domain/entities/index-checkpoint.entity';
import { SelectHealthyTranscriptSectionsUseCase } from './select-healthy-transcript-sections.use-case';

const source: TranscriptSegment[] = [
  { start: 0, end: 120, text: 'first' },
  { start: 120, end: 240, text: 'second' },
  { start: 240, end: 360, text: 'third' },
] as TranscriptSegment[];

const fallback: TranscriptSection[] = [
  { index: 0, startMs: 0, endMs: 180_000, text: 'first second' },
  { index: 1, startMs: 180_000, endMs: 360_000, text: 'third' },
];

describe('SelectHealthyTranscriptSectionsUseCase', () => {
  const useCase = new SelectHealthyTranscriptSectionsUseCase();

  it('keeps a healthy semantic section layout', () => {
    const candidate: TranscriptSection[] = [
      { index: 0, startMs: 0, endMs: 160_000, text: 'first' },
      { index: 1, startMs: 160_000, endMs: 360_000, text: 'second third' },
    ];

    expect(
      useCase.execute({
        candidate,
        fallback,
        sourceSegments: source,
        minimumSeconds: 120,
        maximumSeconds: 480,
      }),
    ).toEqual({ sections: candidate, usedFallback: false });
  });

  it('falls back when semantic sections overlap', () => {
    const candidate: TranscriptSection[] = [
      { index: 0, startMs: 0, endMs: 220_000, text: 'first' },
      { index: 1, startMs: 180_000, endMs: 360_000, text: 'second' },
    ];

    const result = useCase.execute({
      candidate,
      fallback,
      sourceSegments: source,
      minimumSeconds: 120,
      maximumSeconds: 480,
    });

    expect(result.usedFallback).toBe(true);
    expect(result.sections).toEqual(fallback);
    expect(result.reason).toMatch(/overlaps/);
  });
});
