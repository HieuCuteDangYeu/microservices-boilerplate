import type { ExtractedReelMetadata } from '@common/ai/interfaces/reel-metadata-extraction.interface';
import { Injectable } from '@nestjs/common';

export interface NormalizedReelMetadata {
  title?: string;
  description?: string;
  tags: string[];
}

@Injectable()
export class NormalizeReelMetadataUseCase {
  private readonly maxTitleChars = 80;
  private readonly maxDescriptionChars = 500;
  private readonly maxTags = 8;

  execute(input: {
    userTitle?: string;
    userDescription?: string;
    userTags?: string[];
    extractedMetadata?: ExtractedReelMetadata;
  }): NormalizedReelMetadata {
    const userTitle = this.normalizeOptionalText(
      input.userTitle,
      this.maxTitleChars,
    );

    const userDescription = this.normalizeOptionalText(
      input.userDescription,
      this.maxDescriptionChars,
    );

    const extractedTitle = this.normalizeOptionalText(
      input.extractedMetadata?.title,
      this.maxTitleChars,
    );

    const extractedDescription = this.normalizeOptionalText(
      input.extractedMetadata?.description,
      this.maxDescriptionChars,
    );

    const userTags = this.normalizeTags(input.userTags);
    const extractedTags = this.normalizeTags(input.extractedMetadata?.tags);

    return {
      title: userTitle ?? extractedTitle,
      description: userDescription ?? extractedDescription,
      tags: this.mergeTags(userTags, extractedTags),
    };
  }

  private normalizeOptionalText(
    value: unknown,
    maxChars: number,
  ): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.replace(/\s+/g, ' ').trim();

    if (!normalized) {
      return undefined;
    }

    return normalized.length > maxChars
      ? normalized.slice(0, maxChars).trim()
      : normalized;
  }

  private normalizeTags(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const seen = new Set<string>();
    const tags: string[] = [];

    for (const rawTag of value) {
      if (typeof rawTag !== 'string') {
        continue;
      }

      const tag = rawTag
        .replace(/^#+/, '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();

      if (!tag || seen.has(tag)) {
        continue;
      }

      seen.add(tag);
      tags.push(tag);

      if (tags.length >= this.maxTags) {
        break;
      }
    }

    return tags;
  }

  private mergeTags(...tagGroups: string[][]): string[] {
    return this.normalizeTags(tagGroups.flat());
  }
}
