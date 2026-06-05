import { Injectable, Logger } from '@nestjs/common';
import type {
  IConversationSummarizerService,
  SummarizeConversationTurnInput,
  SummarizeConversationTurnResult,
} from '../../domain/interfaces/conversation-summarizer.service.interface';
import { CloudflareWorkersAiTextClient } from './cloudflare-workers-ai-text.client';

@Injectable()
export class CloudflareConversationSummarizerAdapter implements IConversationSummarizerService {
  private readonly logger = new Logger(
    CloudflareConversationSummarizerAdapter.name,
  );

  constructor(
    private readonly cloudflareTextClient: CloudflareWorkersAiTextClient,
  ) {}

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
3. If the existing summary is empty, create a new useful summary from the latest turn.
4. Do not output markdown headings such as "**Summary**".
5. Do not output placeholder text such as "No existing summary."
6. If there is no useful information to summarize, return an empty string.
7. Maximum length: 1200 characters.
8. Return only the updated summary text.

Existing summary:
${input.existingSummary?.trim() || '(empty)'}

Latest user message:
${input.userMessage}

Latest assistant answer:
${input.assistantMessage}
`.trim();

    try {
      const summary = await this.cloudflareTextClient.generateText({
        prompt,
        maxTokens: 400,
      });

      if (!summary) {
        return {
          summary: input.existingSummary?.trim() || '',
        };
      }

      return {
        summary: this.truncate(summary, 1200),
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.warn(
        `Cloudflare conversation summarization failed: ${message}`,
      );

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
