import { Friendship } from '@friend/domain/entities/friendship.entity';
import type {
  IUserBlockRepository,
  PaginatedUserBlockRecords,
  UserBlockPaginationCursor,
} from '@friend/domain/interfaces/user-block.repository.interface';
import { PrismaService } from '@friend/infrastructure/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class UserBlockRepository implements IUserBlockRepository {
  constructor(private readonly prisma: PrismaService) {}

  async blockAndRemoveRelationship(
    blockerId: string,
    blockedUserId: string,
  ): Promise<void> {
    const { userOneId, userTwoId } = Friendship.createPair(
      blockerId,
      blockedUserId,
    );

    await this.prisma.$transaction(async (transaction) => {
      await transaction.userBlock.upsert({
        where: {
          blockerId_blockedUserId: {
            blockerId,
            blockedUserId,
          },
        },
        create: {
          blockerId,
          blockedUserId,
        },
        update: {},
      });

      await transaction.friendship.deleteMany({
        where: {
          userOneId,
          userTwoId,
        },
      });
    });
  }

  async unblock(blockerId: string, blockedUserId: string): Promise<boolean> {
    const result = await this.prisma.userBlock.deleteMany({
      where: {
        blockerId,
        blockedUserId,
      },
    });

    return result.count > 0;
  }

  async isBlockedBetween(
    firstUserId: string,
    secondUserId: string,
  ): Promise<boolean> {
    const block = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          {
            blockerId: firstUserId,
            blockedUserId: secondUserId,
          },
          {
            blockerId: secondUserId,
            blockedUserId: firstUserId,
          },
        ],
      },
      select: {
        blockerId: true,
      },
    });

    return block !== null;
  }

  async listExcludedUserIds(userId: string): Promise<string[]> {
    const blocks = await this.prisma.userBlock.findMany({
      where: {
        OR: [
          {
            blockerId: userId,
          },
          {
            blockedUserId: userId,
          },
        ],
      },
      select: {
        blockerId: true,
        blockedUserId: true,
      },
    });

    return [
      ...new Set(
        blocks.map((block) =>
          block.blockerId === userId ? block.blockedUserId : block.blockerId,
        ),
      ),
    ];
  }

  async listBlocked(
    blockerId: string,
    limit: number,
    cursor?: UserBlockPaginationCursor,
  ): Promise<PaginatedUserBlockRecords> {
    const safeLimit = Math.min(Math.max(limit, 1), 50);

    const records = await this.prisma.userBlock.findMany({
      where: {
        blockerId,
        ...(cursor
          ? {
              OR: [
                {
                  createdAt: {
                    lt: cursor.timestamp,
                  },
                },
                {
                  createdAt: cursor.timestamp,
                  blockedUserId: {
                    gt: cursor.id,
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: [
        {
          createdAt: 'desc',
        },
        {
          blockedUserId: 'asc',
        },
      ],
      take: safeLimit + 1,
      select: {
        blockedUserId: true,
        createdAt: true,
      },
    });

    const hasMore = records.length > safeLimit;

    const items = records.slice(0, safeLimit);

    const last = items.at(-1);

    return {
      items,
      nextCursor:
        hasMore && last
          ? {
              timestamp: last.createdAt,
              id: last.blockedUserId,
            }
          : null,
    };
  }
}
