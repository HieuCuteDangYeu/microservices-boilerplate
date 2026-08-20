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
        const conversation = await tx.conversation.findUnique({
          where: { id: conversationId },
          select: {
            creatorId: true,
            participantIds: true,
            isGroup: true,
            updatedAt: true,
          },
        });

        if (
          !conversation?.isGroup ||
          conversation.creatorId !== actorUserId ||
          !conversation.participantIds.includes(targetUserId)
        ) {
          return false;
        }

        // Touch the legacy Conversation document inside the same transaction so
        // a concurrent ownership transfer or membership mutation conflicts with
        // this role change. Use a temporary timestamp that is guaranteed to
        // differ, then restore the original timestamp before commit. This keeps
        // the write-conflict guard without reordering the conversation merely
        // because a member role changed.
        const guardTimestamp = new Date(conversation.updatedAt.getTime() + 1);
        const ownershipGuard = await tx.conversation.updateMany({
          where: {
            id: conversationId,
            isGroup: true,
            creatorId: actorUserId,
            participantIds: { has: targetUserId },
            updatedAt: conversation.updatedAt,
          },
          data: {
            updatedAt: guardTimestamp,
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
          throw new GroupRoleMutationConflict();
        }

        await tx.conversation.update({
          where: { id: conversationId },
          data: {
            updatedAt: conversation.updatedAt,
          },
        });

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