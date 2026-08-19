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

  async updateMetadata(
    conversationId: string,
    patch: { name?: string; picture?: string | null },
  ): Promise<void> {
    await this.conversationPrisma.conversation.update({
      where: { id: conversationId },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.picture !== undefined ? { picture: patch.picture } : {}),
      },
    });
  }

  async addParticipant(
    conversationId: string,
    userId: string,
    joinedAt: Date,
  ): Promise<void> {
    const conversation = await this.conversationPrisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        participantIds: true,
        memberJoinedAt: true,
        createdAt: true,
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.participantIds.includes(userId)) {
      return;
    }

    const participantIds = [...conversation.participantIds, userId];
    const memberJoinedAt = normalizeMemberJoinedAt(
      conversation.memberJoinedAt,
      conversation.participantIds,
      conversation.createdAt,
    );
    memberJoinedAt[userId] = joinedAt.toISOString();

    await this.conversationPrisma.conversation.update({
      where: { id: conversationId },
      data: {
        participantIds: { set: participantIds },
        memberJoinedAt: memberJoinedAt as Prisma.InputJsonValue,
      },
    });
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

    if (
      conversation.creatorId !== currentOwnerUserId ||
      !conversation.participantIds.includes(userId)
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

    const result = await this.conversationPrisma.conversation.updateMany({
      where: {
        id: conversationId,
        creatorId: currentOwnerUserId,
        participantIds: { has: userId },
      },
      data: {
        participantIds: { set: participantIds },
        memberJoinedAt: memberJoinedAt as Prisma.InputJsonValue,
      },
    });

    return result.count === 1;
  }

  async removeParticipantAsMember(
    conversationId: string,
    userId: string,
  ): Promise<boolean> {
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

    if (
      conversation.creatorId === userId ||
      !conversation.participantIds.includes(userId)
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

    const result = await this.conversationPrisma.conversation.updateMany({
      where: {
        id: conversationId,
        creatorId: { not: userId },
        participantIds: { has: userId },
      },
      data: {
        participantIds: { set: participantIds },
        memberJoinedAt: memberJoinedAt as Prisma.InputJsonValue,
      },
    });

    return result.count === 1;
  }

  async removeParticipant(
    conversationId: string,
    userId: string,
  ): Promise<void> {
    const conversation = await this.conversationPrisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        participantIds: true,
        memberJoinedAt: true,
        createdAt: true,
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

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

    await this.conversationPrisma.conversation.update({
      where: { id: conversationId },
      data: {
        participantIds: { set: participantIds },
        memberJoinedAt: memberJoinedAt as Prisma.InputJsonValue,
      },
    });
  }
}
