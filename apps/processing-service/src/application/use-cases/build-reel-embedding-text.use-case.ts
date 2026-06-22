import { BuiltTranscriptChunk } from '@common/conversation/interfaces/built-transcript-chunk.interface';
import { Injectable } from '@nestjs/common';

@Injectable()
export class BuildReelEmbeddingTextUseCase {
  private readonly defaultTags: string[] = [];

  execute(
    data: {
      title?: string;
      description?: string;
      tags?: string[];
    },
    chunk: BuiltTranscriptChunk,
  ): { text: string; title?: string } {
    if (chunk.type === 'metadata') {
      return this.buildMetadataEmbeddingText(data, chunk);
    }

    return this.buildTranscriptEmbeddingText(data, chunk);
  }

  private buildMetadataEmbeddingText(
    data: {
      title?: string;
    },
    chunk: BuiltTranscriptChunk,
  ): { text: string; title?: string } {
    const title = data.title?.trim() || undefined;

    return {
      text: `Metadata chunk:\n${chunk.text.trim()}`,
      title,
    };
  }

  private buildTranscriptEmbeddingText(
    data: {
      title?: string;
      description?: string;
      tags?: string[];
    },
    chunk: BuiltTranscriptChunk,
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
      this.buildTimeRangeText(chunk),
      `Transcript chunk:\n${chunk.text.trim()}`,
    ].filter((value): value is string => Boolean(value));

    return {
      text: sections.join('\n\n'),
      title,
    };
  }

  private buildTimeRangeText(chunk: BuiltTranscriptChunk): string | undefined {
    if (chunk.startTime === undefined && chunk.endTime === undefined) {
      return undefined;
    }

    return `Time range: ${chunk.startTime ?? 'unknown'}s - ${
      chunk.endTime ?? 'unknown'
    }s`;
  }
}
