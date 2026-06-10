import type {
  ExtractUserMemoriesRequest,
  ExtractUserMemoriesResult,
} from '@common/ai/interfaces/extract-user-memory.interface';
import { Injectable, Logger } from '@nestjs/common';
import type { IMemoryExtractorService } from '../../domain/interfaces/memory-extractor.service.interface';
import { CloudflareWorkersAiTextClient } from './cloudflare-workers-ai-text.client';
import { parseUserMemoryExtractionResult } from './llm/user-memory-extraction.parser';
import { buildUserMemoryExtractionPrompt } from './llm/user-memory-extraction.prompt';

@Injectable()
export class CloudflareMemoryExtractorAdapter implements IMemoryExtractorService {
  private readonly logger = new Logger(CloudflareMemoryExtractorAdapter.name);

  constructor(
    private readonly cloudflareTextClient: CloudflareWorkersAiTextClient,
  ) {}

  async extract(
    input: ExtractUserMemoriesRequest,
  ): Promise<ExtractUserMemoriesResult> {
    const prompt = buildUserMemoryExtractionPrompt(input);

    try {
      const text = await this.cloudflareTextClient.generateText({
        prompt,
        maxTokens: 350,
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
}
