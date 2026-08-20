import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/conversation-client';
import Redis from 'ioredis';

import { Conversation } from '../../domain/entities/conversation.entity';
import type { IChatMediaService } from '../../domain/interfaces/chat-media.service.interface';
import type { IConversationMutationRepository } from '../../domain/interfaces/conversation-mutation.repository.interface';
import type { IEncryptionRepository } from '../../domain/interfaces/encryption.repository.interface';
import type { IUserService } from '../../domain/interfaces/user-service.interface';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationMapper } from './conversation.mapper';
import { PrismaChatRepository } from './prisma-chat.repository';

const MEMBERSHIP_CAS_MAX_ATTEMPTS = 8;

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

type MembershipSnapshot = {
  creatorId: string;
  participantIds: string[];
  memberJoinedAt: Prisma.JsonValue | null;
  createdAt: Date;
};

@Injectable()
export class PrismaConversationChatRepository
  extends PrismaChatRepository
  implements IConversationMutationRepository
{
  constructor(
    private readonly conversationPrisma: PrismaService,
    @Inject('REDIS_CLIENT') redis: Redis,
    @Inject('IEncryptionRepository')
    encryptionRepository: IEncryptionRepository,
    @Inject('IUserService') userService: IUserService,
    @Inject('IChatMediaService') chatMediaService: IChatMediaService,
  ) {
    super(
      conversationPrisma,
      redis,
      encryptionRepository,
      userService,
      chatMediaService,
    );
  }

  override async createConversation(
    conversation: Conversation,
  ): Promise<Conversation> {
    const savedConversation = await this.conversationPrisma.conversation.create(
      {
        data: {
          creatorId: conversation.creatorId,
          participantIds: conversation.participantIds,
          name: conversation.name ?? null,
          picture: conversation.picture ?? null,
          memberJoinedAt: conversation.memberJoinedAt
            ? (conversation.memberJoinedAt as Prisma.InputJsonValue)
            : null,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
          isGroup: conversation.isGroup,
          lastMessage: conversation.lastMessage || null,
          lastMessageAt: conversation.lastMessageAt || null,
        },
      },
    );

    return ConversationMapper.toDomain(savedConversation);
  }

  async updateMetadataAsOwner(
    conversationId: string,
    currentOwnerUserId: string,
    patch: { name?: string; picture?: string | null },
  ): Promise<boolean> {
    const result = await this.conversationPrisma.conversation.updateMany({
      where: {
        id: conversationId,
        creatorId: currentOwnerUserId,
        isGroup: true,
      },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.picture !== undefined ? { picture: patch.picture } : {}),
      },
    });

    return result.count === 1;
  }

  async addParticipantAsOwner(
    conversationId: string,
    currentOwnerUserId: string,
    userId: string,
    joinedAt: Date,
  ): Promise<boolean> {
    for (let attempt = 0; attempt < MEMBERSHIP_CAS_MAX_ATTEMPTS; attempt += 1) {
      const conversation = await this.findMembershipSnapshot(conversationId);

      if (conversation.creatorId !== currentOwnerUserId) {
        return false;
      }

      if (conversation.participantIds.includes(userId)) {
        return false;
      }

      const participantIds = [...conversation.participantIds, userId];
      const memberJoinedAt = normalizeMemberJoinedAt(
        conversation.memberJoinedAt,
        conversation.participantIds,
        conversation.createdAt,
      );
      memberJoinedAt[userId] = joinedAt.toISOString();

      const updated = await this.compareAndSetMembership(
        conversationId,
        conversation.participantIds,
        participantIds,
        memberJoinedAt,
        { creatorId: currentOwnerUserId },
      );

      if (updated) {
        return true;
      }
    }

    return false;
  }

  async transferOwnership(
    conversationId: string,
    currentOwnerUserId: string,
    newOwnerUserId: string,
  ): Promise<boolean> {
    const result = await this.conversationPrisma.conversation.updateMany({
      where: {
        id: conversationId,
        creatorId: currentOwnerUserId,
        participantIds: { has: newOwnerUserId },
      },
      data: { creatorId: newOwnerUserId },
    });

    return result.count === 1;
  }

  async removeParticipantAsOwner(
    conversationId: string,
    currentOwnerUserId: string,
    userId: string,
  ): Promise<boolean> {
    for (let attempt = 0; attempt < MEMBERSHIP_CAS_MAX_ATTEMPTS; attempt += 1) {
      const conversation = await this.findMembershipSnapshot(conversationId);

      if (
        conversation.creatorId !== currentOwnerUserId ||
        !conversation.participantIds.includes(userId) ||
        conversation.participantIds.length <= 2
      ) {
        return false;
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

      const updated = await this.compareAndSetMembership(
        conversationId,
        conversation.participantIds,
        participantIds,
        memberJoinedAt,
        { creatorId: currentOwnerUserId },
      );

      if (updated) {
        return true;
      }
    }

    return false;
  }

  async removeParticipantAsMember(
    conversationId: string,
    userId: string,
  ): Promise<boolean> {
    for (let attempt = 0; attempt < MEMBERSHIP_CAS_MAX_ATTEMPTS; attempt += 1) {
      const conversation = await this.findMembershipSnapshot(conversationId);

      if (
        conversation.creatorId === userId ||
        !conversation.participantIds.includes(userId) ||
        conversation.participantIds.length <= 2
      ) {
        return false;
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

      const updated = await this.compareAndSetMembership(
        conversationId,
        conversation.participantIds,
        participantIds,
        memberJoinedAt,
        { creatorId: { not: userId } },
      );

      if (updated) {
        return true;
      }
    }

    return false;
  }

  async removeParticipant(
    conversationId: string,
    userId: string,
  ): Promise<void> {
    for (let attempt = 0; attempt < MEMBERSHIP_CAS_MAX_ATTEMPTS; attempt += 1) {
      const conversation = await this.findMembershipSnapshot(conversationId);

      if (!conversation.participantIds.includes(userId)) {
        return;
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

      const updated = await this.compareAndSetMembership(
        conversationId,
        conversation.participantIds,
        participantIds,
        memberJoinedAt,
      );

      if (updated) {
        return;
      }
    }
  }

  private async findMembershipSnapshot(
    conversationId: string,
  ): Promise<MembershipSnapshot> {
    const conversation = await this.conversationPrisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        creatorId: true,
        participantIds: true,
        memberJoinedAt: true,
        createdAt: true,
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    return conversation;
  }

  private async compareAndSetMembership(
    conversationId: string,
    expectedParticipantIds: string[],
    participantIds: string[],
    memberJoinedAt: Record<string, string>,
    extraWhere: Prisma.ConversationWhereInput = {},
  ): Promise<boolean> {
    const result = await this.conversationPrisma.conversation.updateMany({
      where: {
        id: conversationId,
        participantIds: { equals: expectedParticipantIds },
        ...extraWhere,
      },
      data: {
        participantIds: { set: participantIds },
        memberJoinedAt: memberJoinedAt as Prisma.InputJsonValue,
      },
    });

    return result.count === 1;
  }
}
