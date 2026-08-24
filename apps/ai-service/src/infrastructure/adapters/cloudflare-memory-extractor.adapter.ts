import type { CloudflareChatEndpoint } from '@ai/infrastructure/adapters/cloudflare-workers-ai-text.client';
import type {
  ExtractUserMemoriesRequest,
  ExtractUserMemoriesResult,
} from '@common/ai/interfaces/extract-user-memory.interface';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IMemoryExtractorService } from '../../domain/interfaces/memory-extractor.service.interface';
import { CloudflareWorkersAiTextClient } from './cloudflare-workers-ai-text.client';
import { parseUserMemoryExtractionResult } from './llm/user-memory-extraction.parser';
import { buildUserMemoryExtractionPrompt } from './llm/user-memory-extraction.prompt';

@Injectable()
export class CloudflareMemoryExtractorAdapter implements IMemoryExtractorService {
  private readonly logger = new Logger(CloudflareMemoryExtractorAdapter.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly cloudflareTextClient: CloudflareWorkersAiTextClient,
  ) {}

  async extract(
    input: ExtractUserMemoriesRequest,
  ): Promise<ExtractUserMemoriesResult> {
    const prompt = buildUserMemoryExtractionPrompt(input);

    try {
      const text = await this.cloudflareTextClient.generateText({
        prompt,
        model: this.getMemoryModel(),
        endpoint: this.getMemoryEndpoint(),
        maxTokens: this.getMemoryExtractionMaxTokens(),
        temperature: this.getMemoryTemperature(),
      });

      const result = parseUserMemoryExtractionResult(text);

      this.logger.debug(
        `[UserMemoryExtractor] extractedCandidates=${result.memories.length}`,
      );

      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.warn(`Cloudflare memory extraction failed: ${message}`);

      return {
        memories: [],
      };
    }
  }

  private getMemoryModel(): string {
    return this.configService.getOrThrow<string>('AI_MEMORY_EXTRACTION_MODEL');
  }

  private getMemoryEndpoint(): CloudflareChatEndpoint {
    const value = this.configService
      .get<string>('CLOUDFLARE_MEMORY_ENDPOINT')
      ?.trim()
      .toLowerCase();

    if (value === 'run') {
      return 'run';
    }

    if (value === 'run_stream') {
      return 'run_stream';
    }

    return 'chat_completions';
  }

  private getMemoryExtractionMaxTokens(): number {
    const value = Number(
      this.configService.get<string>(
        'CLOUDFLARE_MEMORY_EXTRACTION_MAX_TOKENS',
      ) ??
        this.configService.get<string>('CLOUDFLARE_MEMORY_MAX_TOKENS') ??
        '350',
    );

    return Number.isFinite(value) && value > 0 ? value : 350;
  }

  private getMemoryTemperature(): number {
    const value = Number(
      this.configService.get<string>('CLOUDFLARE_MEMORY_TEMPERATURE') ?? '0.1',
    );

    if (!Number.isFinite(value)) {
      return 0.1;
    }

    return Math.min(Math.max(value, 0), 1);
  }
}
