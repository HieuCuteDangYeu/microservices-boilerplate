import type {
  AiChatMemoryContext,
  AiChatMemoryRole,
} from '@common/ai/interfaces/chat-memory-context.interface';
import { BOT_USER_ID } from '@common/constants/seed.constants';
import { Inject, Injectable } from '@nestjs/common';
import { IChatRepository } from '../../domain/interfaces/chat.repository.interface';

@Injectable()
export class BuildBotMemoryContextUseCase {
  private readonly historyLimit = 20;
  private readonly finalLimit = 12;

  constructor(
    @Inject('IChatRepository')
    private readonly chatRepository: IChatRepository,
  ) {}

  async execute(input: {
    conversationId: string;
    currentMessageId: string;
  }): Promise<AiChatMemoryContext> {
    const messages = await this.chatRepository.findMessagesByConversationId(
      input.conversationId,
      this.historyLimit,
    );

    const recentMessages = messages
      .filter((message) => message.id !== input.currentMessageId)
      .filter((message) => message.type === 'text')
      .filter((message) => message.signalType === 0)
      .filter((message) => !message.isRecalled)
      .map((message) => {
        const role: AiChatMemoryRole =
          message.senderId === BOT_USER_ID ? 'assistant' : 'user';

        return {
          role,
          content: message.content?.trim() ?? '',
          createdAt: message.createdAt.toISOString(),
        };
      })
      .filter((message) => message.content.length > 0)
      .slice(-this.finalLimit);

    return {
      recentMessages,
    };
  }
}
