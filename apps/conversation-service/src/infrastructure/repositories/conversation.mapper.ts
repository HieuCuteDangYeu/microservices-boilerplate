import {
  Conversation as PrismaConversation,
  Prisma,
} from '@prisma/conversation-client';
import { Conversation } from '../../domain/entities/conversation.entity';

const toMemberJoinedAt = (
  value: Prisma.JsonValue | null | undefined,
): Record<string, string> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] =>
      typeof entry[1] === 'string' && entry[1].trim().length > 0,
  );

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

export class ConversationMapper {
  static toDomain(prismaData: PrismaConversation): Conversation {
    return new Conversation({
      id: prismaData.id,
      creatorId: prismaData.creatorId ?? '',
      participantIds: prismaData.participantIds,
      isGroup: prismaData.isGroup,
      name: prismaData.name ?? undefined,
      picture: prismaData.picture,
      memberJoinedAt: toMemberJoinedAt(prismaData.memberJoinedAt),
      createdAt: prismaData.createdAt,
      updatedAt: prismaData.updatedAt,
      lastMessage: prismaData.lastMessage ?? undefined,
      lastMessageAt: prismaData.lastMessageAt ?? undefined,
    });
  }
}
