import { Friendship } from '@friend/domain/entities/friendship.entity';
import type {
  FriendshipPaginationCursor,
  IFriendRepository,
  PaginatedFriendships,
} from '@friend/domain/interfaces/friend.repository.interface';
import { Injectable } from '@nestjs/common';
import { Friendship as PrismaFriendship } from '@prisma/friend-client';
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
        status: friendship.status,
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

  async listIncomingPending(
    userId: string,
    limit: number,
    cursor?: FriendshipPaginationCursor,
  ): Promise<PaginatedFriendships> {
    const records = await this.prisma.friendship.findMany({
      where: {
        recipientId: userId,
        status: 'PENDING',
        ...this.buildCursorFilter('createdAt', cursor),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: limit + 1,
    });

    return this.buildPage(records, limit, 'createdAt');
  }

  async listOutgoingPending(
    userId: string,
    limit: number,
    cursor?: FriendshipPaginationCursor,
  ): Promise<PaginatedFriendships> {
    const records = await this.prisma.friendship.findMany({
      where: {
        requesterId: userId,
        status: 'PENDING',
        ...this.buildCursorFilter('createdAt', cursor),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: limit + 1,
    });

    return this.buildPage(records, limit, 'createdAt');
  }

  async listAccepted(
    userId: string,
    limit: number,
    cursor?: FriendshipPaginationCursor,
  ): Promise<PaginatedFriendships> {
    const records = await this.prisma.friendship.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ userOneId: userId }, { userTwoId: userId }],
        ...this.buildCursorFilter('updatedAt', cursor),
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: limit + 1,
    });

    return this.buildPage(records, limit, 'updatedAt');
  }

  async updateStatus(
    id: string,
    status: 'PENDING' | 'ACCEPTED',
    respondedAt: Date | null,
  ): Promise<Friendship> {
    const friendship = await this.prisma.friendship.update({
      where: { id },
      data: {
        status: status,
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

  private buildCursorFilter(
    field: 'createdAt' | 'updatedAt',
    cursor?: FriendshipPaginationCursor,
  ): Record<string, unknown> {
    if (!cursor) {
      return {};
    }

    return {
      AND: [
        {
          OR: [
            { [field]: { lt: cursor.timestamp } },
            {
              [field]: cursor.timestamp,
              id: { gt: cursor.id },
            },
          ],
        },
      ],
    };
  }

  private buildPage(
    records: PrismaFriendship[],
    limit: number,
    cursorField: 'createdAt' | 'updatedAt',
  ): PaginatedFriendships {
    const hasMore = records.length > limit;
    const items = records
      .slice(0, limit)
      .map((friendship) => this.toDomain(friendship));
    const lastItem = items[items.length - 1];

    return {
      items,
      nextCursor:
        hasMore && lastItem
          ? {
              timestamp: lastItem[cursorField]!,
              id: lastItem.id!,
            }
          : null,
    };
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
