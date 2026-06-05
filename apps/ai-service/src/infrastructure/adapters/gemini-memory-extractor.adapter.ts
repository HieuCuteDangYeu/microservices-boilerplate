import type {
  ExtractUserMemoriesRequest,
  ExtractUserMemoriesResult,
} from '@common/ai/interfaces/extract-user-memory.interface';
import { GenerativeModel, GoogleGenerativeAI } from '@google/generative-ai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IMemoryExtractorService } from '../../domain/interfaces/memory-extractor.service.interface';

@Injectable()
export class GeminiMemoryExtractorAdapter implements IMemoryExtractorService {
  private readonly logger = new Logger(GeminiMemoryExtractorAdapter.name);
  private readonly model: GenerativeModel;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');

    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is required for memory extraction');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({
      model:
        this.configService.get<string>('GEMINI_MEMORY_MODEL') ||
        'gemini-2.0-flash',
    });
  }

  async extract(
    input: ExtractUserMemoriesRequest,
  ): Promise<ExtractUserMemoriesResult> {
    const prompt = `
You extract stable long-term user memories from a single conversation turn.

Only extract information that is useful in future conversations.

Allowed memory types:
- PREFERENCE
- PROFILE
- PROJECT
- TECHNICAL_CONTEXT
- COMMUNICATION_STYLE
- OTHER

Do NOT store:
- passwords, API keys, tokens, secrets
- one-time temporary debugging logs
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
      const result = await this.model.generateContent(prompt);
      const text = result.response.text();
      return this.parseJson(text);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Memory extraction failed: ${message}`);

      return {
        memories: [],
      };
    }
  }

  private parseJson(text: string): ExtractUserMemoriesResult {
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
  }
}
