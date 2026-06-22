import type {
  ExtractedReelMetadata,
  ReelMetadataExtractionInput,
} from '@common/ai/interfaces/reel-metadata-extraction.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { IStructuredLlmService } from '../../domain/interfaces/structured-llm.service.interface';

interface RawExtractedReelMetadata {
  title?: string;
  description?: string;
  tags?: string[];
}

@Injectable()
export class ExtractReelMetadataUseCase {
  private readonly logger = new Logger(ExtractReelMetadataUseCase.name);

  private readonly maxTitleChars = 80;
  private readonly maxDescriptionChars = 500;
  private readonly defaultMaxTags = 8;

  constructor(
    @Inject('IStructuredLlmService')
    private readonly structuredLlmService: IStructuredLlmService,
  ) {}

  async execute(
    input: ReelMetadataExtractionInput,
  ): Promise<ExtractedReelMetadata> {
    const normalizedInput = this.normalizeInput(input);

    if (
      !normalizedInput.title &&
      !normalizedInput.description &&
      normalizedInput.tags.length === 0 &&
      !normalizedInput.transcript
    ) {
      return { tags: [] };
    }

    const raw =
      await this.structuredLlmService.generateObject<RawExtractedReelMetadata>({
        systemPrompt: this.buildSystemPrompt(normalizedInput.maxTags),
        userPrompt: this.buildUserPrompt(normalizedInput),
        jsonSchema: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'description', 'tags'],
          properties: {
            title: {
              type: 'string',
              description:
                'Concise searchable reel title. Empty string if impossible.',
            },
            description: {
              type: 'string',
              description:
                'Short searchable summary. Empty string if impossible.',
            },
            tags: {
              type: 'array',
              description: 'Searchable tags without #.',
              items: {
                type: 'string',
              },
            },
          },
        },
        maxTokens: 500,
        temperature: 0.1,
      });

    const metadata = this.normalizeOutput(raw, normalizedInput.maxTags);

    this.logger.log(
      `Extracted metadata title=${Boolean(
        metadata.title,
      )} description=${Boolean(metadata.description)} tags=${
        metadata.tags.length
      }`,
    );

    return metadata;
  }

  private normalizeInput(input: ReelMetadataExtractionInput): {
    title?: string;
    description?: string;
    tags: string[];
    transcript?: string;
    maxTags: number;
  } {
    const maxTags = this.normalizeMaxTags(input.maxTags);

    return {
      title: this.normalizeOptionalText(input.title, this.maxTitleChars),
      description: this.normalizeOptionalText(
        input.description,
        this.maxDescriptionChars,
      ),
      tags: this.normalizeTags(input.tags, maxTags),
      transcript: this.normalizeOptionalText(input.transcript, 6000),
      maxTags,
    };
  }

  private buildSystemPrompt(maxTags: number): string {
    return [
      'You extract clean searchable metadata for short social video reels.',
      'Use only the provided title, description, tags, and transcript.',
      'Do not invent unsupported facts, names, places, brands, or claims.',
      'If the existing title is already good, keep it close to the original.',
      'If the transcript is unclear, be conservative.',
      `Return at most ${maxTags} tags.`,
      'Tags must not include #.',
      'Return only JSON matching the schema.',
    ].join('\n');
  }

  private buildUserPrompt(input: {
    title?: string;
    description?: string;
    tags: string[];
    transcript?: string;
  }): string {
    return [
      input.title ? `Existing title:\n${input.title}` : undefined,
      input.description
        ? `Existing description:\n${input.description}`
        : undefined,
      input.tags.length > 0
        ? `Existing tags:\n${input.tags.join(', ')}`
        : undefined,
      input.transcript ? `Transcript:\n${input.transcript}` : undefined,
    ]
      .filter((section): section is string => Boolean(section))
      .join('\n\n');
  }

  private normalizeOutput(
    raw: RawExtractedReelMetadata,
    maxTags: number,
  ): ExtractedReelMetadata {
    return {
      title: this.normalizeOptionalText(raw.title, this.maxTitleChars),
      description: this.normalizeOptionalText(
        raw.description,
        this.maxDescriptionChars,
      ),
      tags: this.normalizeTags(raw.tags, maxTags),
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

  private normalizeTags(value: unknown, maxTags: number): string[] {
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

      if (tags.length >= maxTags) {
        break;
      }
    }

    return tags;
  }

  private normalizeMaxTags(value: unknown): number {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      return this.defaultMaxTags;
    }

    return Math.min(12, Math.max(3, Math.round(numericValue)));
  }
}
