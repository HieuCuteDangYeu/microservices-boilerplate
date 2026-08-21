import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/conversation-client';

import type { ConversationMemberRole } from '../../domain/interfaces/conversation-member.repository.interface';
import type { ConversationMetadataPatch } from '../../domain/interfaces/conversation-mutation.repository.interface';
import { IGroupManagementV2Repository } from '../../domain/interfaces/group-management-v2.repository.interface';
import { PrismaService } from '../prisma/prisma.service';

const ROLLBACK = Symbol('GROUP_V2_MUTATION_ROLLBACK');

type ConversationSnapshot = {
  id: string;
  creatorId: string;
  participantIds: string[];
  memberJoinedAt: Prisma.JsonValue | null;
  createdAt: Date;
  isGroup: boolean;
};

const normalizeMemberJoinedAt = (
  value: Prisma.JsonValue | null | undefined,
  participantIds: string[],
  fallbackJoinedAt: Date,
): Record<string, string> => {
  const result: Record<string, string> = {};

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    Object.entries(value).forEach(([userId, joinedAt]) => {
      if (typeof joinedAt === 'string' && joinedAt.trim()) {
        result[userId] = joinedAt;
      }
    });
  }

  const fallback = fallbackJoinedAt.toISOString();
  participantIds.forEach((participantId) => {
    if (!result[participantId]) {
      result[participantId] = fallback;
    }
  });

  return result;
};

@Injectable()
export class PrismaGroupManagementV2Repository implements IGroupManagementV2Repository {
  constructor(private readonly prisma: PrismaService) {}

  async updateMetadataWithRoleGuard(
    conversationId: string,
    actorUserId: string,
    expectedActorRole: ConversationMemberRole,
    patch: ConversationMetadataPatch,
  ): Promise<boolean> {
    return await this.runGuarded(async (tx) => {
      const conversation = await this.loadConversation(tx, conversationId);
      if (
        !conversation?.isGroup ||
        !conversation.participantIds.includes(actorUserId)
      ) {
        throw ROLLBACK;
      }

      const actorGuard = await this.lockActiveMember(
        tx,
        conversationId,
        actorUserId,
        expectedActorRole,
      );

      const updated = await tx.conversation.updateMany({
        where: {
          id: conversationId,
          isGroup: true,
          participantIds: { has: actorUserId },
        },
        data: {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.picture !== undefined ? { picture: patch.picture } : {}),
        },
      });

      if (updated.count !== 1) {
        throw ROLLBACK;
      }

      await this.restoreMemberTimestamp(tx, actorGuard);
      return true;
    });
  }

  async addParticipantWithRoleGuard(
    conversationId: string,
    actorUserId: string,
    expectedActorRole: ConversationMemberRole,
    userId: string,
    joinedAt: Date,
  ): Promise<boolean> {
    return await this.runGuarded(async (tx) => {
      const conversation = await this.loadConversation(tx, conversationId);
      if (
        !conversation?.isGroup ||
        !conversation.participantIds.includes(actorUserId)
      ) {
        throw ROLLBACK;
      }

      const actorGuard = await this.lockActiveMember(
        tx,
        conversationId,
        actorUserId,
        expectedActorRole,
      );

      if (conversation.participantIds.includes(userId)) {
        await this.restoreMemberTimestamp(tx, actorGuard);
        return true;
      }

      const participantIds = [...conversation.participantIds, userId];
      const memberJoinedAt = normalizeMemberJoinedAt(
        conversation.memberJoinedAt,
        conversation.participantIds,
        conversation.createdAt,
      );
      memberJoinedAt[userId] = joinedAt.toISOString();

      const updated = await tx.conversation.updateMany({
        where: {
          id: conversationId,
          isGroup: true,
          participantIds: { equals: conversation.participantIds },
        },
        data: {
          participantIds: { set: participantIds },
          memberJoinedAt: memberJoinedAt,
        },
      });

      if (updated.count !== 1) {
        throw ROLLBACK;
      }

      await tx.conversationMember.upsert({
        where: {
          conversationId_userId: {
            conversationId,
            userId,
          },
        },
        create: {
          conversationId,
          userId,
          role: 'MEMBER',
          status: 'ACTIVE',
          joinedAt,
          invitedBy: actorUserId,
        },
        update: {
          role: 'MEMBER',
          status: 'ACTIVE',
          joinedAt,
          invitedBy: actorUserId,
          leftAt: null,
          removedBy: null,
        },
      });

      await this.restoreMemberTimestamp(tx, actorGuard);
      return true;
    });
  }

  async removeParticipantWithRoleGuard(
    conversationId: string,
    actorUserId: string,
    expectedActorRole: ConversationMemberRole,
    userId: string,
    expectedTargetRole: ConversationMemberRole,
    _removedAt: Date,
  ): Promise<boolean> {
    return await this.runGuarded(async (tx) => {
      const conversation = await this.loadConversation(tx, conversationId);
      if (
        !conversation?.isGroup ||
        !conversation.participantIds.includes(actorUserId) ||
        !conversation.participantIds.includes(userId) ||
        conversation.creatorId === userId ||
        expectedTargetRole === 'OWNER' ||
        conversation.participantIds.length <= 2
      ) {
        throw ROLLBACK;
      }

      const actorGuard = await this.lockActiveMember(
        tx,
        conversationId,
        actorUserId,
        expectedActorRole,
      );

      const targetUpdated = await tx.conversationMember.updateMany({
        where: {
          conversationId,
          userId,
          status: 'ACTIVE',
          role: expectedTargetRole,
        },
        data: {
          role: expectedTargetRole,
          status: 'REMOVED',
          leftAt: null,
          removedBy: actorUserId,
        },
      });

      if (targetUpdated.count !== 1) {
        throw ROLLBACK;
      }

      const participantIds = conversation.participantIds.filter(
        (participantId) => participantId !== userId,
      );
      const memberJoinedAt = normalizeMemberJoinedAt(
        conversation.memberJoinedAt,
        conversation.participantIds,
        conversation.createdAt,
      );
      delete memberJoinedAt[userId];

      const updated = await tx.conversation.updateMany({
        where: {
          id: conversationId,
          isGroup: true,
          participantIds: { equals: conversation.participantIds },
        },
        data: {
          participantIds: { set: participantIds },
          memberJoinedAt: memberJoinedAt,
        },
      });

      if (updated.count !== 1) {
        throw ROLLBACK;
      }

      await this.restoreMemberTimestamp(tx, actorGuard);
      return true;
    });
  }

  async leaveParticipantWithRoleGuard(
    conversationId: string,
    userId: string,
    expectedActorRole: ConversationMemberRole,
    leftAt: Date,
  ): Promise<boolean> {
    return await this.runGuarded(async (tx) => {
      const conversation = await this.loadConversation(tx, conversationId);
      if (
        !conversation?.isGroup ||
        conversation.creatorId === userId ||
        !conversation.participantIds.includes(userId) ||
        conversation.participantIds.length <= 2
      ) {
        throw ROLLBACK;
      }

      const memberUpdated = await tx.conversationMember.updateMany({
        where: {
          conversationId,
          userId,
          status: 'ACTIVE',
          role: expectedActorRole,
        },
        data: {
          role: 'MEMBER',
          status: 'LEFT',
          leftAt,
          removedBy: null,
        },
      });

      if (memberUpdated.count !== 1) {
        throw ROLLBACK;
      }

      const participantIds = conversation.participantIds.filter(
        (participantId) => participantId !== userId,
      );
      const memberJoinedAt = normalizeMemberJoinedAt(
        conversation.memberJoinedAt,
        conversation.participantIds,
        conversation.createdAt,
      );
      delete memberJoinedAt[userId];

      const updated = await tx.conversation.updateMany({
        where: {
          id: conversationId,
          isGroup: true,
          creatorId: { not: userId },
          participantIds: { equals: conversation.participantIds },
        },
        data: {
          participantIds: { set: participantIds },
          memberJoinedAt: memberJoinedAt,
        },
      });

      if (updated.count !== 1) {
        throw ROLLBACK;
      }

      return true;
    });
  }

  async transferOwnershipWithRoleGuard(
    conversationId: string,
    actorUserId: string,
    newOwnerUserId: string,
    expectedTargetRole: Exclude<ConversationMemberRole, 'OWNER'>,
  ): Promise<boolean> {
    return await this.runGuarded(async (tx) => {
      const conversation = await this.loadConversation(tx, conversationId);
      if (
        !conversation?.isGroup ||
        actorUserId === newOwnerUserId ||
        conversation.creatorId !== actorUserId ||
        !conversation.participantIds.includes(actorUserId) ||
        !conversation.participantIds.includes(newOwnerUserId)
      ) {
        throw ROLLBACK;
      }

      const ownerUpdated = await tx.conversationMember.updateMany({
        where: {
          conversationId,
          userId: actorUserId,
          status: 'ACTIVE',
          role: 'OWNER',
        },
        data: { role: 'MEMBER' },
      });

      if (ownerUpdated.count !== 1) {
        throw ROLLBACK;
      }

      const targetUpdated = await tx.conversationMember.updateMany({
        where: {
          conversationId,
          userId: newOwnerUserId,
          status: 'ACTIVE',
          role: expectedTargetRole,
        },
        data: { role: 'OWNER' },
      });

      if (targetUpdated.count !== 1) {
        throw ROLLBACK;
      }

      const conversationUpdated = await tx.conversation.updateMany({
        where: {
          id: conversationId,
          isGroup: true,
          creatorId: actorUserId,
          participantIds: { equals: conversation.participantIds },
        },
        data: { creatorId: newOwnerUserId },
      });

      if (conversationUpdated.count !== 1) {
        throw ROLLBACK;
      }

      return true;
    });
  }

  private async loadConversation(
    tx: Prisma.TransactionClient,
    conversationId: string,
  ): Promise<ConversationSnapshot | null> {
    return await tx.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        creatorId: true,
        participantIds: true,
        memberJoinedAt: true,
        createdAt: true,
        isGroup: true,
      },
    });
  }

  private async lockActiveMember(
    tx: Prisma.TransactionClient,
    conversationId: string,
    userId: string,
    expectedRole: ConversationMemberRole,
  ): Promise<{ id: string; updatedAt: Date }> {
    const member = await tx.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
      select: {
        id: true,
        status: true,
        role: true,
        updatedAt: true,
      },
    });

    if (!member || member.status !== 'ACTIVE' || member.role !== expectedRole) {
      throw ROLLBACK;
    }

    const guardTimestamp = new Date(member.updatedAt.getTime() + 1);
    const guarded = await tx.conversationMember.updateMany({
      where: {
        id: member.id,
        status: 'ACTIVE',
        role: expectedRole,
        updatedAt: member.updatedAt,
      },
      data: { updatedAt: guardTimestamp },
    });

    if (guarded.count !== 1) {
      throw ROLLBACK;
    }

    return { id: member.id, updatedAt: member.updatedAt };
  }

  private async restoreMemberTimestamp(
    tx: Prisma.TransactionClient,
    member: { id: string; updatedAt: Date },
  ): Promise<void> {
    await tx.conversationMember.update({
      where: { id: member.id },
      data: { updatedAt: member.updatedAt },
    });
  }

  private async runGuarded(
    operation: (tx: Prisma.TransactionClient) => Promise<boolean>,
  ): Promise<boolean> {
    try {
      return await this.prisma.$transaction(operation);
    } catch (error) {
      if (error === ROLLBACK) {
        return false;
      }
      throw error;
    }
  }
}
