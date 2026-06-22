import { ReelChunkIndexInput } from '@common/content/interfaces/reel-chunk-index.interface';
import { Injectable } from '@nestjs/common';

export interface ReelIndexValidationResult {
  valid: boolean;
  warnings: string[];
}

@Injectable()
export class ValidateReelIndexUseCase {
  execute(data: {
    title?: string;
    description?: string;
    tags?: string[];
    transcript?: string;
    chunks?: ReelChunkIndexInput[];
  }): ReelIndexValidationResult {
    const warnings: string[] = [];

    const hasMetadata =
      Boolean(data.title?.trim()) ||
      Boolean(data.description?.trim()) ||
      (Array.isArray(data.tags) && data.tags.length > 0);

    const hasTranscript = Boolean(data.transcript?.trim());

    if (!hasMetadata && !hasTranscript) {
      warnings.push('No metadata or transcript available for indexing.');
    }

    if (!Array.isArray(data.chunks) || data.chunks.length === 0) {
      warnings.push('No searchable chunks were generated.');
    }

    const chunksWithoutEmbeddings =
      data.chunks?.filter((chunk) => chunk.embedding.length === 0) ?? [];

    if (chunksWithoutEmbeddings.length > 0) {
      warnings.push(
        `${chunksWithoutEmbeddings.length} chunks have no embedding values.`,
      );
    }

    return {
      valid: warnings.length === 0,
      warnings,
    };
  }
}
