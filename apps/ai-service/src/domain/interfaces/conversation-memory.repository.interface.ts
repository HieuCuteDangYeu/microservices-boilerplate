import { ConversationMemory } from '../entities/conversation-memory.entity';

export interface ConversationMemoryUpsertInput {
  conversationId: string;
  userId: string;
  summary: string;
  messageCount: number;
  lastMessageAt?: Date;
}

export interface IConversationMemoryRepository {
  findByConversationId(
    conversationId: string,
  ): Promise<ConversationMemory | null>;

  upsert(input: ConversationMemoryUpsertInput): Promise<ConversationMemory>;
}
