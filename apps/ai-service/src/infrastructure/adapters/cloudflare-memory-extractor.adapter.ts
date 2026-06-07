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
You extract stable long-term user memories from one conversation turn.

Use the USER MESSAGE as the only source of truth.
The assistant answer is context only. Do not extract memories from assistant wording.

Return strict JSON only.

JSON shape:
{
  "memories": [
    {
      "type": "PREFERENCE|PROFILE|PROJECT|TECHNICAL_CONTEXT|COMMUNICATION_STYLE|OTHER",
      "content": "stable memory about the user in one sentence",
      "confidence": 0.0,
      "scope": "LONG_TERM|TEMPORARY",
      "evidence": "short exact text span from the USER MESSAGE"
    }
  ]
}

Rules:
1. Only return LONG_TERM memories when the user message contains durable context useful in future conversations.
2. Return TEMPORARY for short-lived status updates, one-time debugging steps, or current-turn-only information.
3. The evidence must be copied from the USER MESSAGE, not the assistant answer.
4. If there is no evidence from the USER MESSAGE, return an empty memories array.
5. Do not store assistant offers, assistant capabilities, or assistant wording.
6. Do not store secrets, credentials, tokens, or private sensitive personal data.
7. If there is no stable long-term user memory, return {"memories":[]}.

User message:
<user_message>
${input.userMessage}
</user_message>

Assistant answer for context only:
<assistant_answer>
${input.assistantMessage}
</assistant_answer>
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
    const candidate = this.extractFirstJsonObject(
      this.stripMarkdownFence(text),
    );

    if (!candidate) {
      this.logger.warn('Cloudflare memory extractor returned non-JSON output');
      return { memories: [] };
    }

    try {
      const parsed = JSON.parse(candidate) as ExtractUserMemoriesResult;

      if (!Array.isArray(parsed.memories)) {
        return { memories: [] };
      }

      return {
        memories: parsed.memories
          .filter((memory) => typeof memory.content === 'string')
          .filter((memory) => typeof memory.evidence === 'string')
          .filter((memory) => memory.content.trim().length > 0)
          .map((memory) => ({
            type: memory.type,
            content: memory.content.trim(),
            confidence:
              typeof memory.confidence === 'number'
                ? Math.max(0, Math.min(memory.confidence, 1))
                : 0,
            scope:
              memory.scope === 'LONG_TERM' || memory.scope === 'TEMPORARY'
                ? memory.scope
                : 'TEMPORARY',
            evidence: memory.evidence.trim(),
          })),
      };
    } catch {
      this.logger.warn('Cloudflare memory extractor returned invalid JSON');
      return { memories: [] };
    }
  }

  private stripMarkdownFence(text: string): string {
    return text
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();
  }

  private extractFirstJsonObject(text: string): string | null {
    const start = text.indexOf('{');

    if (start === -1) {
      return null;
    }

    let depth = 0;

    for (let index = start; index < text.length; index += 1) {
      const char = text[index];

      if (char === '{') {
        depth += 1;
      }

      if (char === '}') {
        depth -= 1;
      }

      if (depth === 0) {
        return text.slice(start, index + 1).trim();
      }
    }

    return null;
  }
}
