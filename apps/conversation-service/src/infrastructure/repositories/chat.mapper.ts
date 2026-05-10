import {
  MessageReadStatus,
  Message as PrismaMessage,
} from '@prisma/conversation-client';
import { Conversation } from '../../domain/entities/conversation.entity';
import { Message } from '../../domain/entities/message.entity';
import { ReadStatus } from '../../domain/entities/read-status.entity';

export class ChatMapper {
  static toDomain(
    prismaMsg: PrismaMessage & { readBy?: MessageReadStatus[] },
  ): Message {
    return new Message({
      id: prismaMsg.id,
      conversationId: prismaMsg.conversationId,
      senderId: prismaMsg.senderId,

      type: prismaMsg.type,
      signalType: prismaMsg.signalType,
      content: prismaMsg.content,
      registrationId: prismaMsg.registrationId ?? undefined,
      createdAt: prismaMsg.createdAt,
      readBy: prismaMsg.readBy
        ? prismaMsg.readBy.map(
            (r) => new ReadStatus({ userId: r.userId, at: r.at }),
          )
        : [],
    });
  }

  static toDto(domain: Message) {
    return {
      id: domain.id,
      conversationId: domain.conversationId,
      senderId: domain.senderId,
      content: domain.content,
      type: domain.type,
      signalType: domain.signalType,
      createdAt: domain.createdAt.toISOString(),
      createdAtMs: domain.createdAt.getTime(),
      readBy: domain.readBy.map((r) => ({
        userId: r.userId,
        at: r.at.toISOString(),
      })),
    };
  }

  static conversationToDto(domain: Conversation) {
    return {
      id: domain.id,
      creatorId: domain.creatorId,
      participantIds: domain.participantIds,
      participants: domain.participants,
      lastMessage: domain.lastMessage,
      lastMessageAt: domain.lastMessageAt?.toISOString() ?? null,
      isGroup: domain.isGroup,
      createdAt: domain.createdAt.toISOString(),
      updatedAt: domain.updatedAt.toISOString(),
    };
  }
}
