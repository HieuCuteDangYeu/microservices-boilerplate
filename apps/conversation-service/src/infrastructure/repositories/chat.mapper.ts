import {
  MessageReadStatus,
  Message as PrismaMessage,
} from '@prisma/conversation-client';
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

      // 👇 CẬP NHẬT 3 DÒNG NÀY
      type: prismaMsg.type, // Business Type
      signalType: prismaMsg.signalType, // Signal Type
      content: prismaMsg.content, // Ciphertext
      registrationId: prismaMsg.registrationId ?? undefined,
      createdAt: prismaMsg.createdAt,
      readBy: prismaMsg.readBy
        ? prismaMsg.readBy.map(
            (r) => new ReadStatus({ userId: r.userId, at: r.at }),
          )
        : [],
    });
  }
}
