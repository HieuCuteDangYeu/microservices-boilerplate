import { TranscriptSegment } from '@common/ai/interfaces/transcription-result.interface';
import { ReelChunkIndexInput } from '@common/content/interfaces/reel-chunk-index.interface';
import type { IAiEmbeddingService } from '@content/application/use-cases/ai-embedding.service.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  IContentRepository,
  ReelChunkBackfillCandidate,
  ReelChunkBackfillCursor,
} from '../../domain/interfaces/content.repository.interface';

interface BuiltTranscriptChunk {
  text: string;
  startTime?: number;
  endTime?: number;
}

export interface BackfillReelChunksOptions {
  batchSize?: number;
  maxReels?: number;
  dryRun?: boolean;
  reelId?: string;
}

export interface BackfillReelChunksResult {
  scannedReels: number;
  processedReels: number;
  skippedReels: number;
  failedReels: number;
  createdChunks: number;
}

@Injectable()
export class BackfillReelChunksUseCase {
  private readonly logger = new Logger(BackfillReelChunksUseCase.name);
  private readonly maxChunkChars = 1200;

  constructor(
    @Inject('IContentRepository')
    private readonly contentRepository: IContentRepository,

    @Inject('IAiEmbeddingService')
    private readonly aiEmbeddingService: IAiEmbeddingService,
  ) {}

  async execute(
    options: BackfillReelChunksOptions = {},
  ): Promise<BackfillReelChunksResult> {
    const batchSize = this.normalizePositiveInteger(options.batchSize, 10);
    const maxReels = this.normalizePositiveInteger(options.maxReels, 0);
    const dryRun = options.dryRun ?? false;

    let cursor: ReelChunkBackfillCursor | undefined;
    let scannedReels = 0;
    let processedReels = 0;
    let skippedReels = 0;
    let failedReels = 0;
    let createdChunks = 0;

    do {
      const page = await this.contentRepository.findReelsForChunkBackfill(
        batchSize,
        cursor,
        options.reelId,
      );

      if (page.items.length === 0) {
        break;
      }

      for (const reel of page.items) {
        if (maxReels > 0 && scannedReels >= maxReels) {
          return {
            scannedReels,
            processedReels,
            skippedReels,
            failedReels,
            createdChunks,
          };
        }

        scannedReels += 1;

        try {
          const chunks = await this.buildIndexedChunks(reel);

          if (chunks.length === 0) {
            skippedReels += 1;
            this.logger.warn(
              `[Backfill] Reel ${reel.id} skipped because no valid chunks were generated`,
            );
            continue;
          }

          if (!dryRun) {
            await this.contentRepository.replaceReelChunks(
              reel.id,
              reel.userId,
              chunks,
            );
          }

          processedReels += 1;
          createdChunks += chunks.length;

          this.logger.log(
            `[Backfill] Reel ${reel.id} ${dryRun ? 'would create' : 'created'} ${chunks.length} chunks`,
          );
        } catch (error: unknown) {
          failedReels += 1;

          const message =
            error instanceof Error ? error.message : String(error);

          this.logger.error(`[Backfill] Reel ${reel.id} failed: ${message}`);
        }
      }

      cursor = page.nextCursor ?? undefined;
    } while (cursor && !options.reelId);

    return {
      scannedReels,
      processedReels,
      skippedReels,
      failedReels,
      createdChunks,
    };
  }

  private async buildIndexedChunks(
    reel: ReelChunkBackfillCandidate,
  ): Promise<ReelChunkIndexInput[]> {
    let transcriptChunks = this.buildChunksFromSegments(
      reel.transcriptSegments,
    );

    if (transcriptChunks.length === 0) {
      transcriptChunks = this.buildChunksFromTranscript(reel.transcript);
    }

    const indexedChunks: ReelChunkIndexInput[] = [];

    for (let index = 0; index < transcriptChunks.length; index++) {
      const chunk = transcriptChunks[index];

      const embeddingText = this.buildEmbeddingText(reel, chunk.text);

      const embedding = await this.aiEmbeddingService.generateEmbedding({
        text: embeddingText.text,
        taskType: 'RETRIEVAL_DOCUMENT',
        title: embeddingText.title,
      });

      indexedChunks.push({
        chunkIndex: index,
        text: chunk.text,
        startTime: chunk.startTime,
        endTime: chunk.endTime,
        embedding: embedding.values,
        embeddingModel: `${embedding.model}:${embedding.dimensions}`,
      });
    }

    return indexedChunks;
  }

  private buildChunksFromSegments(
    segments?: TranscriptSegment[],
  ): BuiltTranscriptChunk[] {
    if (!Array.isArray(segments) || segments.length === 0) {
      return [];
    }

    const chunks: BuiltTranscriptChunk[] = [];
    let currentTexts: string[] = [];
    let currentStarts: Array<number | undefined> = [];
    let currentStart: number | undefined;
    let currentEnd: number | undefined;
    let currentLength = 0;

    for (const segment of segments) {
      const text = typeof segment.text === 'string' ? segment.text.trim() : '';

      if (!text) {
        continue;
      }

      const start = Number(segment.start);
      const end = Number(segment.end);
      const nextLength = currentLength + text.length + 1;

      if (currentTexts.length > 0 && nextLength > this.maxChunkChars) {
        chunks.push({
          text: currentTexts.join(' ').trim(),
          startTime: currentStart,
          endTime: currentEnd,
        });

        const overlap = currentTexts.slice(-1);
        const overlapStart = currentStarts.slice(-1)[0];

        currentTexts = [...overlap];
        currentStarts = [overlapStart];
        currentLength = overlap.join(' ').length;
        currentStart = overlapStart ?? currentEnd;
      }

      if (currentTexts.length === 0 && Number.isFinite(start)) {
        currentStart = start;
      }

      currentTexts.push(text);
      currentStarts.push(Number.isFinite(start) ? start : undefined);
      currentLength += text.length + 1;

      if (Number.isFinite(end)) {
        currentEnd = end;
      }
    }

    if (currentTexts.length > 0) {
      chunks.push({
        text: currentTexts.join(' ').trim(),
        startTime: currentStart,
        endTime: currentEnd,
      });
    }

    return chunks;
  }

  private buildChunksFromTranscript(
    transcript?: string,
  ): BuiltTranscriptChunk[] {
    const text = transcript?.trim();

    if (!text) {
      return [];
    }

    const parts = text
      .split(/(?<=[.!?。！？])\s+/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    if (parts.length === 0) {
      return [{ text }];
    }

    const chunks: BuiltTranscriptChunk[] = [];
    let current: string[] = [];
    let currentLength = 0;

    for (const part of parts) {
      const nextLength = currentLength + part.length + 1;

      if (current.length > 0 && nextLength > this.maxChunkChars) {
        chunks.push({ text: current.join(' ').trim() });

        const overlap = current.slice(-1);

        current = [...overlap];
        currentLength = overlap.join(' ').length;
      }

      current.push(part);
      currentLength += part.length + 1;
    }

    if (current.length > 0) {
      chunks.push({ text: current.join(' ').trim() });
    }

    return chunks;
  }

  private buildEmbeddingText(
    reel: ReelChunkBackfillCandidate,
    chunkText: string,
  ): { text: string; title?: string } {
    const title = reel.title?.trim() || undefined;
    const description = reel.description?.trim() || undefined;

    const tags = (reel.tags ?? [])
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

    const sections = [
      title ? `Title: ${title}` : undefined,
      description ? `Description: ${description}` : undefined,
      tags.length > 0 ? `Tags: ${tags.join(', ')}` : undefined,
      `Transcript chunk:\n${chunkText.trim()}`,
    ].filter((value): value is string => Boolean(value));

    return {
      text: sections.join('\n\n'),
      title,
    };
  }

  private normalizePositiveInteger(
    value: number | undefined,
    fallback: number,
  ): number {
    if (value === undefined || !Number.isFinite(value)) {
      return fallback;
    }

    return Math.max(0, Math.floor(value));
  }
}
