import { Injectable } from '@nestjs/common';
import {
  Friendship as PrismaFriendship,
  FriendshipStatus as PrismaFriendshipStatus,
} from '@prisma/friend-client';
import { Friendship } from '@friend/domain/entities/friendship.entity';
import type { IFriendRepository } from '@friend/domain/interfaces/friend.repository.interface';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FriendRepository implements IFriendRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(friendship: Friendship): Promise<Friendship> {
    const createdFriendship = await this.prisma.friendship.create({
      data: {
        requesterId: friendship.requesterId,
        recipientId: friendship.recipientId,
        userOneId: friendship.userOneId,
        userTwoId: friendship.userTwoId,
        status: friendship.status as PrismaFriendshipStatus,
      },
    });

    return this.toDomain(createdFriendship);
  }

  async findById(id: string): Promise<Friendship | null> {
    const friendship = await this.prisma.friendship.findUnique({
      where: { id },
    });

    return friendship ? this.toDomain(friendship) : null;
  }

  async findByUsers(
    userId: string,
    otherUserId: string,
  ): Promise<Friendship | null> {
    const { userOneId, userTwoId } = Friendship.createPair(userId, otherUserId);
    const friendship = await this.prisma.friendship.findUnique({
      where: {
        userOneId_userTwoId: {
          userOneId,
          userTwoId,
        },
      },
    });

    return friendship ? this.toDomain(friendship) : null;
  }

  async listIncomingPending(userId: string): Promise<Friendship[]> {
    const friendships = await this.prisma.friendship.findMany({
      where: {
        recipientId: userId,
        status: 'PENDING',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return friendships.map((friendship) => this.toDomain(friendship));
  }

  async listOutgoingPending(userId: string): Promise<Friendship[]> {
    const friendships = await this.prisma.friendship.findMany({
      where: {
        requesterId: userId,
        status: 'PENDING',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return friendships.map((friendship) => this.toDomain(friendship));
  }

  async listAccepted(userId: string): Promise<Friendship[]> {
    const friendships = await this.prisma.friendship.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ userOneId: userId }, { userTwoId: userId }],
      },
      orderBy: [{ respondedAt: 'desc' }, { updatedAt: 'desc' }],
    });

    return friendships.map((friendship) => this.toDomain(friendship));
  }

  async updateStatus(
    id: string,
    status: 'PENDING' | 'ACCEPTED',
    respondedAt: Date,
  ): Promise<Friendship> {
    const friendship = await this.prisma.friendship.update({
      where: { id },
      data: {
        status: status as PrismaFriendshipStatus,
        respondedAt,
      },
    });

    return this.toDomain(friendship);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.friendship.delete({
      where: { id },
    });
  }

  private toDomain(friendship: PrismaFriendship): Friendship {
    return new Friendship(
      friendship.id,
      friendship.requesterId,
      friendship.recipientId,
      friendship.userOneId,
      friendship.userTwoId,
      friendship.status,
      friendship.createdAt,
      friendship.updatedAt,
      friendship.respondedAt,
    );
  }
}
