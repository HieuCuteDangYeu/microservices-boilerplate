import { Friendship } from '@friend/domain/entities/friendship.entity';
import type { IUserBlockRepository } from '@friend/domain/interfaces/user-block.repository.interface';
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
}
