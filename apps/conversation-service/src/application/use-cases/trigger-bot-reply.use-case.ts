import { BOT_USER_ID } from '@common/constants/seed.constants';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Message } from '../../domain/entities/message.entity';
import { IChatRepository } from '../../domain/interfaces/chat.repository.interface';
import { ProcessBotReplyUseCase } from './process-bot-reply.use-case';

export interface TriggerBotReplyResult {
  triggered: boolean;
  botReply?: Message;
  botError?: { code: string; message: string };
}

@Injectable()
export class TriggerBotReplyUseCase {
  private readonly logger = new Logger(TriggerBotReplyUseCase.name);

  constructor(
    @Inject('IChatRepository') private readonly chatRepository: IChatRepository,
    private readonly processBotReplyUseCase: ProcessBotReplyUseCase,
  ) {}

  async execute(
    userMessage: Message,
    senderId: string,
  ): Promise<TriggerBotReplyResult> {
    if (userMessage.type !== 'text' || senderId === BOT_USER_ID) {
      return { triggered: false };
    }

    const conversation = await this.chatRepository.findConversation(
      userMessage.conversationId,
    );

    if (!conversation?.participantIds?.includes(BOT_USER_ID)) {
      return { triggered: false };
    }

    try {
      const result = await this.processBotReplyUseCase.execute(userMessage);

      return {
        triggered: true,
        botReply: result.botReply,
        botError: result.botError,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Bot reply trigger failed: ${msg}`);
      return {
        triggered: false,
        botError: { code: 'TRIGGER_FAILED', message: msg },
      };
    }
  }
}
