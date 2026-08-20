import type { Conversation } from '../entities/conversation.entity';
import type { Message } from '../entities/message.entity';

export abstract class IConversationRealtimePublisher {
  abstract emitNewMessage(conversationId: string, message: Message): void;
  abstract emitConversationUpdated(
    conversation: Conversation,
    userIds?: string[],
  ): void;
}
