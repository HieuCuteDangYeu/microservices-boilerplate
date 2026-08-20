import { Injectable } from '@nestjs/common';
import type {
  ConversationMemberRecord,
  IConversationMemberRepository,
} from '../../domain/interfaces/conversation-member.repository.interface';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PrismaConversationMemberRepository
  implements IConversationMemberRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async listByConversation(
    conversationId: string,
  ): Promise<ConversationMemberRecord[]> {
    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId },
      orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
    });

    return members.map((member) => ({
      id: member.id,
      conversationId: member.conversationId,
      userId: member.userId,
      role: member.role,
      status: member.status,
      joinedAt: member.joinedAt,
      invitedBy: member.invitedBy,
      leftAt: member.leftAt,
      removedBy: member.removedBy,
    }));
  }
}
