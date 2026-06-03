import { TranscriptSegment } from '@common/ai/interfaces/transcription-result.interface';
import { ReelChunkIndexInput } from '@common/content/interfaces/reel-chunk-index.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { IAiService } from '../../domain/interfaces/ai-service.interface';
import { formatProcessingError } from './processing-error-formatter.service';

interface BuiltTranscriptChunk {
  text: string;
  startTime?: number;
  endTime?: number;
}

@Injectable()
export class ReelChunkBuilderService {
  private readonly logger = new Logger(ReelChunkBuilderService.name);
  private readonly defaultTags: string[] = [];
  private readonly maxChunkChars = 1200;

  constructor(
    @Inject('IAiService')
    private readonly aiService: IAiService,
  ) {}

  async buildSearchableChunks(data: {
    reelId: string;
    title?: string;
    description?: string;
    tags?: string[];
    transcript?: string;
    transcriptSegments?: TranscriptSegment[];
  }): Promise<ReelChunkIndexInput[]> {
    let builtChunks = this.buildChunksFromSegments(data.transcriptSegments);

    if (builtChunks.length === 0) {
      builtChunks = this.buildChunksFromTranscript(data.transcript);
    }

    if (builtChunks.length === 0) {
      const metadataOnlyChunk = this.buildMetadataOnlyChunk(data);

      if (metadataOnlyChunk) {
        builtChunks = [metadataOnlyChunk];
      }
    }

    const chunks: ReelChunkIndexInput[] = [];

    for (let index = 0; index < builtChunks.length; index++) {
      const chunk = builtChunks[index];
      const embeddingDocument = this.buildEmbeddingText(data, chunk.text);

      try {
        const embedding = await this.aiService.generateEmbedding({
          text: embeddingDocument.text,
          taskType: 'RETRIEVAL_DOCUMENT',
          title: embeddingDocument.title,
        });

        chunks.push({
          chunkIndex: index,
          text: chunk.text,
          startTime: chunk.startTime,
          endTime: chunk.endTime,
          embedding: embedding.values,
          embeddingModel: `${embedding.model}:${embedding.dimensions}`,
        });
      } catch (error: unknown) {
        const { message, stack } = formatProcessingError(error);

        this.logger.warn(
          `[Reel ${data.reelId}] Failed to embed chunk ${index}: ${message}`,
          stack,
        );
      }
    }

    return chunks;
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
      const text = segment.text?.trim();

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

  private buildMetadataOnlyChunk(data: {
    title?: string;
    description?: string;
    tags?: string[];
  }): BuiltTranscriptChunk | null {
    const title = data.title?.trim();
    const description = data.description?.trim();

    const tags = (data.tags ?? this.defaultTags)
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

    const sections = [
      title ? `Title: ${title}` : undefined,
      description ? `Description: ${description}` : undefined,
      tags.length > 0 ? `Tags: ${tags.join(', ')}` : undefined,
    ].filter((value): value is string => Boolean(value));

    if (sections.length === 0) {
      return null;
    }

    return {
      text: sections.join('\n'),
    };
  }

  private buildEmbeddingText(
    data: {
      title?: string;
      description?: string;
      tags?: string[];
    },
    chunkText: string,
  ): { text: string; title?: string } {
    const title = data.title?.trim() || undefined;
    const description = data.description?.trim() || undefined;

    const tags = (data.tags ?? this.defaultTags)
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
}
