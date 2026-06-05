import type { ConversationTurnCompletedPayload } from '@common/ai/interfaces/user-memory.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { IConversationMemoryRepository } from '../../domain/interfaces/conversation-memory.repository.interface';
import type { IConversationSummarizerService } from '../../domain/interfaces/conversation-summarizer.service.interface';

@Injectable()
export class UpdateConversationMemoryUseCase {
  private readonly logger = new Logger(UpdateConversationMemoryUseCase.name);

  constructor(
    @Inject('IConversationMemoryRepository')
    private readonly conversationMemoryRepository: IConversationMemoryRepository,
    @Inject('IConversationSummarizerService')
    private readonly conversationSummarizerService: IConversationSummarizerService,
  ) {}

  async execute(payload: ConversationTurnCompletedPayload): Promise<void> {
    if (
      !payload.userId ||
      !payload.conversationId ||
      !payload.userMessage?.trim() ||
      !payload.assistantMessage?.trim()
    ) {
      return;
    }

    const existing =
      await this.conversationMemoryRepository.findByConversationId(
        payload.conversationId,
      );

    const summarized = await this.conversationSummarizerService.summarizeTurn({
      existingSummary: existing?.summary,
      userMessage: payload.userMessage,
      assistantMessage: payload.assistantMessage,
    });

    const summary = summarized.summary.trim();

    if (!summary) {
      return;
    }

    const saved = await this.conversationMemoryRepository.upsert({
      conversationId: payload.conversationId,
      userId: payload.userId,
      summary,
      messageCount: (existing?.messageCount ?? 0) + 2,
      lastMessageAt: new Date(),
    });

    this.logger.log(
      `[ConversationMemory] updated conversationId=${saved.conversationId} messageCount=${saved.messageCount}`,
    );
  }
}
