import { Injectable } from '@nestjs/common';
import type {
  ConversationMemberRecord,
  IConversationMemberRepository,
} from '../../domain/interfaces/conversation-member.repository.interface';
import { PrismaService } from '../prisma/prisma.service';

class GroupRoleMutationConflict extends Error {}

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

  async changeRoleAsLegacyOwner(
    conversationId: string,
    actorUserId: string,
    targetUserId: string,
    expectedRole: 'ADMIN' | 'MEMBER',
    nextRole: 'ADMIN' | 'MEMBER',
  ): Promise<boolean> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Write the legacy Conversation document inside the same transaction so
        // a concurrent ownership transfer or membership mutation conflicts with
        // this role change instead of allowing a stale-owner write skew.
        const ownershipGuard = await tx.conversation.updateMany({
          where: {
            id: conversationId,
            isGroup: true,
            creatorId: actorUserId,
            participantIds: { has: targetUserId },
          },
          data: {
            creatorId: actorUserId,
          },
        });

        if (ownershipGuard.count !== 1) {
          return false;
        }

        const roleUpdate = await tx.conversationMember.updateMany({
          where: {
            conversationId,
            userId: targetUserId,
            status: 'ACTIVE',
            role: expectedRole,
          },
          data: {
            role: nextRole,
          },
        });

        if (roleUpdate.count !== 1) {
          // Roll the no-op Conversation guard write back as well. This keeps a
          // failed/idempotent role mutation from changing conversation.updatedAt.
          throw new GroupRoleMutationConflict();
        }

        return true;
      });
    } catch (error) {
      if (error instanceof GroupRoleMutationConflict) {
        return false;
      }
      throw error;
    }
  }
}
