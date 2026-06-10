import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  IConversationSummarizerService,
  SummarizeConversationTurnInput,
  SummarizeConversationTurnResult,
} from '../../domain/interfaces/conversation-summarizer.service.interface';
import { CloudflareWorkersAiTextClient } from './cloudflare-workers-ai-text.client';
import {
  getStructuredConversationSummaryShape,
  hasUsefulStructuredConversationSummary,
  parseConversationSummaryResult,
} from './llm/conversation-summary.parser';
import { buildConversationSummaryPrompt } from './llm/conversation-summary.prompt';
import { renderConversationSummary } from './llm/conversation-summary.renderer';

@Injectable()
export class CloudflareConversationSummarizerAdapter implements IConversationSummarizerService {
  private readonly logger = new Logger(
    CloudflareConversationSummarizerAdapter.name,
  );

  constructor(
    private readonly configService: ConfigService,
    private readonly cloudflareTextClient: CloudflareWorkersAiTextClient,
  ) {}

  async summarizeTurn(
    input: SummarizeConversationTurnInput,
  ): Promise<SummarizeConversationTurnResult> {
    try {
      const prompt = buildConversationSummaryPrompt(input);

      const response = await this.cloudflareTextClient.generateChatText({
        model: this.getMemoryModel(),
        maxTokens: 650,
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content: prompt.systemPrompt,
          },
          {
            role: 'user',
            content: prompt.userPrompt,
          },
        ],
      });

      this.logger.debug(
        `[ConversationSummary] rawResponse=${this.truncate(
          response.replace(/\s+/g, ' '),
          1500,
        )}`,
      );

      const structured = parseConversationSummaryResult(response, input);
      this.logStructuredSummaryShape(structured);

      if (!structured) {
        this.logger.warn(
          'Cloudflare summarizer returned invalid structured output; keeping existing summary.',
        );

        return this.keepExistingSummary(input);
      }

      if (!hasUsefulStructuredConversationSummary(structured)) {
        this.logger.warn(
          'Cloudflare summarizer returned structured output without grounded useful memory; keeping existing summary.',
        );

        return this.keepExistingSummary(input);
      }

      const rendered = renderConversationSummary(structured);

      if (!rendered) {
        return this.keepExistingSummary(input);
      }

      return {
        summary: this.truncate(rendered, 1200),
        shouldUpdate: true,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.warn(
        `Cloudflare conversation summarization failed: ${message}`,
      );

      return this.keepExistingSummary(input);
    }
  }

  private keepExistingSummary(
    input: SummarizeConversationTurnInput,
  ): SummarizeConversationTurnResult {
    return {
      summary: input.existingSummary?.trim() || '',
      shouldUpdate: false,
    };
  }

  private logStructuredSummaryShape(
    structured: Parameters<typeof getStructuredConversationSummaryShape>[0],
  ): void {
    const shape = getStructuredConversationSummaryShape(structured);

    if (!shape) {
      this.logger.debug('[ConversationSummary] parsed=null');
      return;
    }

    this.logger.debug(
      `[ConversationSummary] groundedShape currentGoal=${shape.hasCurrentGoal} implemented=${shape.implementedCount} decisions=${shape.decisionsCount} openIssues=${shape.openIssuesCount} nextSteps=${shape.nextStepsCount} constraints=${shape.constraintsCount}`,
    );
  }

  private truncate(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
      return value;
    }

    return `${value.slice(0, maxLength).trim()}...`;
  }

  private getMemoryModel(): string {
    return (
      this.configService.get<string>('CLOUDFLARE_MEMORY_MODEL') ||
      '@cf/meta/llama-3.1-8b-instruct'
    );
  }
}
