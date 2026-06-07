import type {
  ExtractedUserMemoryCandidate,
  ExtractedUserMemoryScope,
  ExtractUserMemoriesRequest,
  ExtractUserMemoriesResult,
} from '@common/ai/interfaces/extract-user-memory.interface';
import type { UserMemoryType } from '@common/ai/interfaces/user-memory.interface';
import { Injectable, Logger } from '@nestjs/common';
import type { IMemoryExtractorService } from '../../domain/interfaces/memory-extractor.service.interface';
import { CloudflareWorkersAiTextClient } from './cloudflare-workers-ai-text.client';

interface RawExtractedUserMemoryCandidate {
  type?: unknown;
  content?: unknown;
  confidence?: unknown;
  scope?: unknown;
  evidence?: unknown;
}

interface RawExtractUserMemoriesResult {
  memories?: unknown;
}

@Injectable()
export class CloudflareMemoryExtractorAdapter implements IMemoryExtractorService {
  private readonly logger = new Logger(CloudflareMemoryExtractorAdapter.name);

  private readonly allowedTypes = new Set<UserMemoryType>([
    'PREFERENCE',
    'PROFILE',
    'PROJECT',
    'TECHNICAL_CONTEXT',
    'COMMUNICATION_STYLE',
    'OTHER',
  ]);

  constructor(
    private readonly cloudflareTextClient: CloudflareWorkersAiTextClient,
  ) {}

  async extract(
    input: ExtractUserMemoriesRequest,
  ): Promise<ExtractUserMemoriesResult> {
    const prompt = this.buildPrompt(input);

    try {
      const text = await this.cloudflareTextClient.generateText({
        prompt,
        maxTokens: 350,
      });

      const result = this.parseJson(text);

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

  private buildPrompt(input: ExtractUserMemoriesRequest): string {
    return `
Return only valid JSON. No markdown. No explanation.

You extract stable long-term user memories from one conversation turn.

Use the USER MESSAGE as the only source of truth.
The assistant answer is context only. Do not extract memories from assistant wording.

Required JSON shape:
{
  "memories": [
    {
      "type": "",
      "content": "",
      "confidence": 0,
      "scope": "",
      "evidence": ""
    }
  ]
}

Allowed type values:
- PREFERENCE
- PROFILE
- PROJECT
- TECHNICAL_CONTEXT
- COMMUNICATION_STYLE
- OTHER

Allowed scope values:
- LONG_TERM
- TEMPORARY

Field meanings:
- type: exactly one allowed type value.
- content: one stable memory about the user.
- confidence: number between 0 and 1.
- scope: LONG_TERM only for durable future-useful memory; TEMPORARY for short-lived or current-turn-only information.
- evidence: short exact text copied from the USER MESSAGE.

Rules:
1. Return only valid JSON.
2. Do not wrap JSON in markdown fences.
3. Do not copy the field meanings into the JSON values.
4. Do not output combined enum strings such as "PREFERENCE|PROFILE|PROJECT|TECHNICAL_CONTEXT|COMMUNICATION_STYLE|OTHER".
5. Do not output combined scope strings such as "LONG_TERM|TEMPORARY".
6. Only return LONG_TERM memories when the USER MESSAGE contains durable context useful in future conversations.
7. Return TEMPORARY for short-lived status updates, one-time debugging steps, or current-turn-only information.
8. The evidence must be copied from the USER MESSAGE, not the assistant answer.
9. If there is no exact evidence from the USER MESSAGE, return {"memories":[]}.
10. Do not store assistant offers, assistant capabilities, assistant wording, or generic assistant replies.
11. Do not store secrets, credentials, tokens, or private sensitive personal data.
12. If there is no stable long-term user memory, return {"memories":[]}.

User message:
<user_message>
${input.userMessage}
</user_message>

Assistant answer for context only:
<assistant_answer>
${input.assistantMessage}
</assistant_answer>
`.trim();
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
      const parsed = JSON.parse(candidate) as RawExtractUserMemoriesResult;

      if (!Array.isArray(parsed.memories)) {
        return { memories: [] };
      }

      const memories = parsed.memories
        .map((memory) =>
          this.toMemoryCandidate(memory as RawExtractedUserMemoryCandidate),
        )
        .filter(
          (memory): memory is ExtractedUserMemoryCandidate => memory !== null,
        );

      return {
        memories,
      };
    } catch {
      this.logger.warn('Cloudflare memory extractor returned invalid JSON');
      return { memories: [] };
    }
  }

  private toMemoryCandidate(
    memory: RawExtractedUserMemoryCandidate,
  ): ExtractedUserMemoryCandidate | null {
    const type = this.parseType(memory.type);

    if (!type) {
      this.logger.debug(
        `[UserMemoryExtractor] rejected invalid type=${String(memory.type)}`,
      );
      return null;
    }

    const scope = this.parseScope(memory.scope);

    if (!scope) {
      this.logger.debug(
        `[UserMemoryExtractor] rejected invalid scope=${String(memory.scope)}`,
      );
      return null;
    }

    if (typeof memory.content !== 'string') {
      return null;
    }

    if (typeof memory.evidence !== 'string') {
      return null;
    }

    const content = this.sanitizeText(memory.content);
    const evidence = this.sanitizeText(memory.evidence);

    if (!content || !evidence) {
      return null;
    }

    return {
      type,
      content,
      confidence: this.parseConfidence(memory.confidence),
      scope,
      evidence,
    };
  }

  private parseType(value: unknown): UserMemoryType | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim().toUpperCase();

    if (this.allowedTypes.has(normalized as UserMemoryType)) {
      return normalized as UserMemoryType;
    }

    return null;
  }

  private parseScope(value: unknown): ExtractedUserMemoryScope | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim().toUpperCase();

    if (normalized === 'LONG_TERM' || normalized === 'TEMPORARY') {
      return normalized;
    }

    return null;
  }

  private parseConfidence(value: unknown): number {
    if (typeof value !== 'number') {
      return 0;
    }

    if (!Number.isFinite(value)) {
      return 0;
    }

    return Math.max(0, Math.min(value, 1));
  }

  private sanitizeText(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
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
