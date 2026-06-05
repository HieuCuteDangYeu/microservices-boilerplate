import type {
  ExtractUserMemoriesRequest,
  ExtractUserMemoriesResult,
} from '@common/ai/interfaces/extract-user-memory.interface';
import { Injectable, Logger } from '@nestjs/common';
import type { IMemoryExtractorService } from '../../domain/interfaces/memory-extractor.service.interface';
import { CloudflareWorkersAiTextClient } from './cloudflare-workers-ai-text.client';

@Injectable()
export class CloudflareMemoryExtractorAdapter implements IMemoryExtractorService {
  private readonly logger = new Logger(CloudflareMemoryExtractorAdapter.name);

  constructor(
    private readonly cloudflareTextClient: CloudflareWorkersAiTextClient,
  ) {}

  async extract(
    input: ExtractUserMemoriesRequest,
  ): Promise<ExtractUserMemoriesResult> {
    const prompt = `
You extract stable long-term user memories from a single conversation turn.

Only extract information useful in future conversations.

Allowed memory types:
- PREFERENCE
- PROFILE
- PROJECT
- TECHNICAL_CONTEXT
- COMMUNICATION_STYLE
- OTHER

Do NOT store:
- passwords, API keys, tokens, secrets
- temporary debugging logs
- private sensitive personal data
- raw conversation history
- guesses or uncertain assumptions
- assistant statements unless the user confirms them

Return strict JSON only:
{
  "memories": [
    {
      "type": "PREFERENCE|PROFILE|PROJECT|TECHNICAL_CONTEXT|COMMUNICATION_STYLE|OTHER",
      "content": "stable memory in one sentence",
      "confidence": 0.0
    }
  ]
}

User message:
${input.userMessage}

Assistant answer:
${input.assistantMessage}
    `.trim();

    try {
      const text = await this.cloudflareTextClient.generateText({
        prompt,
        maxTokens: 512,
      });

      return this.parseJson(text);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Cloudflare memory extraction failed: ${message}`);

      return {
        memories: [],
      };
    }
  }

  private parseJson(text: string): ExtractUserMemoriesResult {
    try {
      const cleaned = text
        .trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```$/i, '')
        .trim();

      const parsed = JSON.parse(cleaned) as ExtractUserMemoriesResult;

      if (!Array.isArray(parsed.memories)) {
        return { memories: [] };
      }

      return {
        memories: parsed.memories
          .filter((memory) => typeof memory.content === 'string')
          .filter((memory) => memory.content.trim().length > 0)
          .map((memory) => ({
            type: memory.type,
            content: memory.content.trim(),
            confidence:
              typeof memory.confidence === 'number'
                ? Math.max(0, Math.min(memory.confidence, 1))
                : 0.7,
          })),
      };
    } catch {
      this.logger.warn('Cloudflare memory extractor returned invalid JSON');
      return { memories: [] };
    }
  }
}
