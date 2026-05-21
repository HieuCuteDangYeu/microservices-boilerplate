import { Conversation } from 'apps/conversation-service/src/domain/entities/conversation.entity';
import {
  Message,
  type MessageMedia,
  type RecallMessageResult,
} from 'apps/conversation-service/src/domain/entities/message.entity';

export interface MediaProcessingSyncResult {
  conversationIds: string[];
  messageIds: string[];
  media: MessageMedia;
}

export abstract class IChatRepository {
  abstract createMessage(message: Message): Promise<Message>;
  abstract assertConversationParticipant(
    conversationId: string,
    userId: string,
  ): Promise<void>;
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
  abstract hasSharedConversation(
    userId1: string,
    userId2: string,
  ): Promise<boolean>;
  abstract findPresenceAudienceUserIds(userId: string): Promise<string[]>;
  abstract findPrivateConversation(
    userId1: string,
    userId2: string,
  ): Promise<Conversation | null>;

  abstract findConversationsByUserId(
    userId: string,
    limit: number,
    cursor?: string,
  ): Promise<Conversation[]>;
  abstract addReaction(
    messageId: string,
    userId: string,
    emoji: string,
  ): Promise<Message>;
  abstract removeReaction(messageId: string, userId: string): Promise<Message>;
  abstract recallMessage(
    messageId: string,
    userId: string,
  ): Promise<RecallMessageResult>;
  abstract syncMediaProcessingResult(
    fileKey: string,
    media: MessageMedia,
  ): Promise<MediaProcessingSyncResult>;
}
