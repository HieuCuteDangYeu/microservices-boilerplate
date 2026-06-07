import type { ConversationTurnCompletedPayload } from '@common/ai/interfaces/user-memory.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IConversationMemoryRepository } from '../../domain/interfaces/conversation-memory.repository.interface';
import type { IConversationSummarizerService } from '../../domain/interfaces/conversation-summarizer.service.interface';

export interface UpdateConversationMemoryResult {
  messageCount: number;
  summaryUpdated: boolean;
}

@Injectable()
export class UpdateConversationMemoryUseCase {
  private readonly logger = new Logger(UpdateConversationMemoryUseCase.name);

  constructor(
    private readonly configService: ConfigService,

    @Inject('IConversationMemoryRepository')
    private readonly conversationMemoryRepository: IConversationMemoryRepository,

    @Inject('IConversationSummarizerService')
    private readonly conversationSummarizerService: IConversationSummarizerService,
  ) {}

  async execute(
    payload: ConversationTurnCompletedPayload,
  ): Promise<UpdateConversationMemoryResult> {
    if (
      !payload.userId ||
      !payload.conversationId ||
      !payload.userMessage?.trim() ||
      !payload.assistantMessage?.trim()
    ) {
      return {
        messageCount: 0,
        summaryUpdated: false,
      };
    }

    const existing =
      await this.conversationMemoryRepository.findByConversationId(
        payload.conversationId,
      );

    const nextMessageCount = (existing?.messageCount ?? 0) + 2;

    const everyNTurns = this.getPositiveNumber(
      'AI_CONVERSATION_MEMORY_EVERY_N_TURNS',
      4,
    );

    const shouldSummarize =
      Math.floor(nextMessageCount / 2) % everyNTurns === 0;

    let nextSummary = existing?.summary ?? '';
    let summaryUpdated = false;

    if (shouldSummarize) {
      const summarized = await this.conversationSummarizerService.summarizeTurn(
        {
          existingSummary: existing?.summary,
          recentMessages: payload.memory?.recentMessages,
          userMessage: payload.userMessage,
          assistantMessage: payload.assistantMessage,
        },
      );

      if (!summarized.shouldUpdate) {
        this.logger.warn(
          `[ConversationMemory] summarizer skipped update conversationId=${payload.conversationId}`,
        );
      } else {
        const summary = this.sanitizeSummary(summarized.summary);

        if (this.isInvalidSummary(summary)) {
          this.logger.warn(
            `[ConversationMemory] skipped invalid summary conversationId=${payload.conversationId}`,
          );
        } else {
          nextSummary = summary;
          summaryUpdated = true;
        }
      }
    }

    const saved = await this.conversationMemoryRepository.upsert({
      conversationId: payload.conversationId,
      userId: payload.userId,
      summary: nextSummary,
      messageCount: nextMessageCount,
      lastMessageAt: new Date(),
    });

    this.logger.log(
      `[ConversationMemory] conversationId=${saved.conversationId} messageCount=${saved.messageCount} summaryUpdated=${summaryUpdated} recentMessages=${payload.memory?.recentMessages?.length ?? 0}`,
    );

    return {
      messageCount: saved.messageCount,
      summaryUpdated,
    };
  }

  private sanitizeSummary(value: string): string {
    return value
      .trim()
      .replace(/^#+\s*summary\s*:?\s*/i, '')
      .replace(/^\*\*summary\*\*\s*:?\s*/i, '')
      .replace(/^summary\s*:?\s*/i, '')
      .trim();
  }

  private isInvalidSummary(value: string): boolean {
    const normalized = value.toLowerCase().replace(/\s+/g, ' ').trim();

    return (
      normalized.length === 0 ||
      normalized === 'no existing summary.' ||
      normalized === 'no existing summary' ||
      normalized === '(empty)' ||
      normalized === 'empty' ||
      normalized === '**summary** no existing summary.' ||
      normalized === '**summary** no existing summary'
    );
  }

  private getPositiveNumber(key: string, fallback: number): number {
    const value = Number(this.configService.get<string>(key) ?? fallback);

    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}
