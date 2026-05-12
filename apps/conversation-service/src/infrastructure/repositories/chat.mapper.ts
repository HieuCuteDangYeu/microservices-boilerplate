import {
  Prisma,
  MessageReadStatus,
  Message as PrismaMessage,
} from '@prisma/conversation-client';
import {
  Message,
  type MessageReactionMap,
  type MessageReplyPreview,
} from '../../domain/entities/message.entity';
import { ReadStatus } from '../../domain/entities/read-status.entity';

export class ChatMapper {
  static toDomain(
    prismaMsg: PrismaMessage & {
      readBy?: MessageReadStatus[];
      replyPreview?: Prisma.JsonValue | null;
      reactions?: Prisma.JsonValue | null;
    },
  ): Message {
    return new Message({
      id: prismaMsg.id,
      conversationId: prismaMsg.conversationId,
      senderId: prismaMsg.senderId,

      // 👇 CẬP NHẬT 3 DÒNG NÀY
      type: prismaMsg.type, // Business Type
      signalType: prismaMsg.signalType, // Signal Type
      content: prismaMsg.content, // Ciphertext
      registrationId: prismaMsg.registrationId ?? undefined,
      createdAt: prismaMsg.createdAt,
      isRecalled: prismaMsg.isRecalled,
      recalledAt: prismaMsg.recalledAt ?? undefined,
      replyToId: prismaMsg.replyToId ?? undefined,
      replyPreview: ChatMapper.toReplyPreview(prismaMsg.replyPreview),
      readBy: prismaMsg.readBy
        ? prismaMsg.readBy.map(
            (r) => new ReadStatus({ userId: r.userId, at: r.at }),
          )
        : [],
      reactions: ChatMapper.toReactionMap(prismaMsg.reactions),
    });
  }

  private static toReactionMap(
    value: Prisma.JsonValue | null | undefined,
  ): MessageReactionMap | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    const entries = Object.entries(value as Record<string, unknown>)
      .map(([userId, reaction]) => {
        if (!reaction || typeof reaction !== 'object' || Array.isArray(reaction)) {
          return null;
        }

        const emoji = (reaction as Record<string, unknown>).emoji;
        const createdAt = (reaction as Record<string, unknown>).createdAt;

        if (typeof emoji !== 'string' || typeof createdAt !== 'string') {
          return null;
        }

        return [userId, { emoji, createdAt }] as const;
      })
      .filter((entry): entry is readonly [string, { emoji: string; createdAt: string }] => entry !== null);

    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
  }

  private static toReplyPreview(
    value: Prisma.JsonValue | null | undefined,
  ): MessageReplyPreview | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    const senderName = (value as Record<string, unknown>).senderName;
    const content = (value as Record<string, unknown>).content;
    const type = (value as Record<string, unknown>).type;

    if (
      typeof senderName !== 'string' ||
      typeof content !== 'string' ||
      !['text', 'image', 'video', 'file', 'call'].includes(String(type))
    ) {
      return undefined;
    }

    return {
      senderName,
      content,
      type: type as MessageReplyPreview['type'],
    };
  }
}
