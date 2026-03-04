import { Conversation as PrismaConversation } from '@prisma/conversation-client';
import { Conversation } from '../../domain/entities/conversation.entity';

export class ConversationMapper {
  static toDomain(prismaData: PrismaConversation): Conversation {
    return new Conversation({
      id: prismaData.id,

      creatorId: prismaData.creatorId ?? '',

      participantIds: prismaData.participantIds,
      isGroup: prismaData.isGroup,
      createdAt: prismaData.createdAt,
      updatedAt: prismaData.updatedAt,
      lastMessage: prismaData.lastMessage ?? undefined,
      lastMessageAt: prismaData.lastMessageAt ?? undefined,
    });
  }
}
