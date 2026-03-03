import { Conversation } from 'apps/conversation-service/src/domain/entities/conversation.entity';
import { Message } from 'apps/conversation-service/src/domain/entities/message.entity';

export abstract class IChatRepository {
  abstract createMessage(message: Message): Promise<Message>;
  abstract findMessagesByConversationId(
    conversationId: string,
    limit: number,
    cursor?: string,
  ): Promise<Message[]>;
  abstract createConversation(
    conversation: Conversation,
  ): Promise<Conversation>;
  abstract findConversation(id: string): Promise<Conversation | null>;
  abstract markMessagesAsSeen(
    conversationId: string,
    userId: string,
  ): Promise<number>;
  abstract findPrivateConversation(
    userId1: string,
    userId2: string,
  ): Promise<Conversation | null>;

  abstract findConversationsByUserId(
    userId: string,
    limit: number,
    cursor?: string,
  ): Promise<Conversation[]>;
}
