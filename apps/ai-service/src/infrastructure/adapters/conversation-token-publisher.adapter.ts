import type {
  IChatTokenPublisher,
  PublishChatTokenInput,
} from '@ai/domain/interfaces/chat-token-publisher.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';

@Injectable()
export class ConversationTokenPublisherAdapter implements IChatTokenPublisher {
  private readonly logger = new Logger(ConversationTokenPublisherAdapter.name);

  constructor(
    @Inject('CONVERSATION_RMQ')
    private readonly conversationClient: ClientProxy,
  ) {}

  publishToken(input: PublishChatTokenInput): void {
    try {
      this.conversationClient.emit('ai.stream_token', {
        conversationId: input.conversationId,
        userId: input.userId,
        token: input.token,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.warn(
        `Failed to publish AI stream token for conversation ${input.conversationId}: ${message}`,
      );
    }
  }
}
