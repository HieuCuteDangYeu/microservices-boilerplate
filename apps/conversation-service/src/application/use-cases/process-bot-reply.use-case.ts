import { Inject, Injectable, Logger } from '@nestjs/common';
import { BOT_USER_ID } from '@common/constants/seed.constants';
import { Message } from '../../domain/entities/message.entity';
import type {
  BotError,
  IAiService,
} from '../../domain/interfaces/ai-service.interface';
import { IChatRepository } from '../../domain/interfaces/chat.repository.interface';

export interface ProcessBotReplyResult {
  botReply?: Message;
  botError?: BotError;
}

@Injectable()
export class ProcessBotReplyUseCase {
  private readonly logger = new Logger(ProcessBotReplyUseCase.name);

  constructor(
    @Inject('IChatRepository') private readonly chatRepository: IChatRepository,
    @Inject('IAiService') private readonly aiService: IAiService,
  ) {}

  async execute(userMessage: Message): Promise<ProcessBotReplyResult> {
    let botReply: Message | undefined;
    let botError: BotError | undefined;

    try {
      const result = await this.aiService.askQuestionStream(
        userMessage.content,
        userMessage.senderId,
        userMessage.conversationId,
      );

      if (result.answer) {
        const botMessage = new Message({
          id: '',
          conversationId: userMessage.conversationId,
          senderId: BOT_USER_ID,
          content: result.answer,
          signalType: 0,
          type: 'text',
          createdAt: new Date(),
        });

        botReply = await this.chatRepository.createMessage(botMessage);
        this.logger.debug(
          `Bot reply ${botReply.id} saved for conversation ${userMessage.conversationId}`,
        );
      }

      if (result.error) {
        botError = result.error;
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error(
          `Failed to process bot reply: ${error.message}`,
          error.stack,
        );
      }

      botError = {
        code: 'AI_UNAVAILABLE',
        message: 'AI service is temporarily unavailable',
      };
    }

    return { botReply, botError };
  }
}
