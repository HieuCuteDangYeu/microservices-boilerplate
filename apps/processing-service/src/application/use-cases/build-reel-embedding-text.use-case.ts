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
