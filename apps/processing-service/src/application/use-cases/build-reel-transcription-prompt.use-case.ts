import { Injectable } from '@nestjs/common';

@Injectable()
export class BuildReelTranscriptionPromptUseCase {
  private readonly defaultTags: string[] = [];

  execute(data: { title?: string; tags?: string[] }): string {
    const title = data.title?.trim();

    const tags = (data.tags ?? this.defaultTags)
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0)
      .map((tag) => tag.replace(/^#/, ''));

    const hints = [
      'Identify the single primary spoken language of the audio.',
      'Transcribe the speech mainly according to that primary language.',
      'Preserve short foreign words, greetings, names, slang, usernames, hashtags, product names, and technical terms exactly as spoken.',
      'Do not translate.',
      'Do not rewrite words from the primary language into similar-sounding English words.',
      'If the primary language is Vietnamese, preserve Vietnamese phrases such as "anh em", "mọi người", "xin chào", and "hôm nay" exactly.',
      'If a phrase is unclear, prefer the closest phonetic transcription in the primary language instead of replacing it with a common English phrase.',
      title ? `Video title/context: ${title}` : undefined,
      tags.length > 0
        ? `Important terms that may appear: ${tags.join(', ')}`
        : undefined,
    ].filter((value): value is string => Boolean(value));

    return hints.join('\n');
  }
}
