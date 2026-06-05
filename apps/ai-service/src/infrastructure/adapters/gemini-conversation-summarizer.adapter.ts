import {
  IConversationSummarizerService,
  SummarizeConversationTurnInput,
  SummarizeConversationTurnResult,
} from '@ai/domain/interfaces/conversation-summarizer.service.interface';
import { GenerativeModel, GoogleGenerativeAI } from '@google/generative-ai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GeminiConversationSummarizerAdapter implements IConversationSummarizerService {
  private readonly logger = new Logger(
    GeminiConversationSummarizerAdapter.name,
  );
  private readonly model: GenerativeModel;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');

    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is required for conversation summarizer');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({
      model:
        this.configService.get<string>('GEMINI_MEMORY_MODEL') ||
        'gemini-2.0-flash',
    });
  }

  async summarizeTurn(
    input: SummarizeConversationTurnInput,
  ): Promise<SummarizeConversationTurnResult> {
    const prompt = `
You update a rolling summary for one chat conversation.

The summary will be used as memory in future AI responses.

Keep:
- user goals
- project context
- architecture decisions
- implementation progress
- unresolved problems
- next planned steps
- important constraints

Do NOT keep:
- every message verbatim
- temporary logs
- secrets, passwords, API keys, tokens
- private sensitive information
- irrelevant small talk
- hallucinated assumptions

Rules:
1. Preserve useful technical context.
2. Keep it concise but complete.
3. If the existing summary is empty, create a new one.
4. If the latest turn changes the plan, update the summary.
5. Maximum length: 1800 characters.
6. Return only the updated summary text.

Existing summary:
${input.existingSummary?.trim() || 'No existing summary.'}

Latest user message:
${input.userMessage}

Latest assistant answer:
${input.assistantMessage}
    `.trim();

    try {
      const result = await this.model.generateContent(prompt);
      const summary = result.response.text().trim();

      if (!summary) {
        return {
          summary: input.existingSummary?.trim() || '',
        };
      }

      return {
        summary: this.truncate(summary, 1800),
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.warn(`Conversation summarization failed: ${message}`);

      return {
        summary: input.existingSummary?.trim() || '',
      };
    }
  }

  private truncate(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
      return value;
    }

    return `${value.slice(0, maxLength).trim()}...`;
  }
}
