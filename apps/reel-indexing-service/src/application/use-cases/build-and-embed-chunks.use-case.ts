import type { ExtractedReelMetadata } from '@common/ai/interfaces/reel-metadata-extraction.interface';
import type { TranscriptSegment } from '@common/ai/interfaces/transcription-result.interface';
import type { ReelChunkIndexInput } from '@common/content/interfaces/reel-chunk-index.interface';
import type { IIndexingAiService } from '@indexing/domain/interfaces/ai-service.interface';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface TextChunk {
  text: string;
  startTime?: number;
  endTime?: number;
}

@Injectable()
export class BuildAndEmbedChunksUseCase {
  constructor(
    private readonly configService: ConfigService,
    @Inject('IIndexingAiService') private readonly ai: IIndexingAiService,
  ) {}

  async execute(input: {
    transcript?: string;
    transcriptSegments?: TranscriptSegment[];
    metadata: ExtractedReelMetadata;
  }): Promise<ReelChunkIndexInput[]> {
    const chunks = this.buildChunks(input);
    const output: ReelChunkIndexInput[] = [];
    await this.mapWithConcurrency(
      chunks,
      this.getPositiveInt('INDEX_EMBEDDING_CONCURRENCY', 4, 1, 32),
      async (chunk, chunkIndex) => {
        const result = await this.ai.generateEmbedding(chunk.text);
        output[chunkIndex] = {
          chunkIndex,
          text: chunk.text,
          startTime: chunk.startTime,
          endTime: chunk.endTime,
          embedding: result.values,
          embeddingModel: result.model,
        };
      },
    );
    return output;
  }

  private buildChunks(input: {
    transcript?: string;
    transcriptSegments?: TranscriptSegment[];
    metadata: ExtractedReelMetadata;
  }): TextChunk[] {
    if (input.transcriptSegments?.length) {
      const chunks: TextChunk[] = [];
      let current: TranscriptSegment[] = [];
      const flush = () => {
        if (!current.length) return;
        chunks.push({
          text: current
            .map((segment) => segment.text.trim())
            .filter(Boolean)
            .join(' '),
          startTime: current[0].start,
          endTime: current[current.length - 1].end,
        });
        current = [];
      };
      for (const segment of input.transcriptSegments) {
        const length =
          current.reduce((total, value) => total + value.text.length, 0) +
          segment.text.length;
        const duration = current.length ? segment.end - current[0].start : 0;
        if (current.length && (length > 1_200 || duration > 45)) flush();
        current.push(segment);
      }
      flush();
      if (chunks.some((chunk) => chunk.text.length > 0))
        return chunks.filter((chunk) => chunk.text.length > 0);
    }

    const fallback = [
      input.metadata.title,
      input.metadata.description,
      input.metadata.tags.length ? input.metadata.tags.join(' ') : undefined,
      input.transcript,
    ]
      .filter((value): value is string => Boolean(value?.trim()))
      .join('\n')
      .trim();
    return fallback ? [{ text: fallback.slice(0, 8_000) }] : [];
  }

  private async mapWithConcurrency<T>(
    values: T[],
    concurrency: number,
    handler: (value: T, index: number) => Promise<void>,
  ): Promise<void> {
    let cursor = 0;
    const workers = Array.from(
      { length: Math.min(concurrency, values.length) },
      async () => {
        while (cursor < values.length) {
          const index = cursor++;
          await handler(values[index], index);
        }
      },
    );
    await Promise.all(workers);
  }

  private getPositiveInt(
    key: string,
    fallback: number,
    min: number,
    max: number,
  ): number {
    const parsed = Number(this.configService.get<string>(key) ?? fallback);
    return Number.isFinite(parsed)
      ? Math.min(max, Math.max(min, Math.round(parsed)))
      : fallback;
  }
}
