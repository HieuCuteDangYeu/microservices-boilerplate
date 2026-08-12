import type { IIndexAttemptReadRepository } from '@content/domain/interfaces/index-attempt-read.repository.interface';
import { PrismaService } from '@content/infrastructure/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class PrismaIndexAttemptReadRepository implements IIndexAttemptReadRepository {
  constructor(private readonly prisma: PrismaService) {}

  async isIndexingAttemptCurrent(input: {
    reelId: string;
    indexAttemptId: string;
  }): Promise<boolean> {
    const count = await this.prisma.reel.count({
      where: {
        id: input.reelId,
        indexAttemptId: input.indexAttemptId,
        mediaStatus: 'COMPLETED',
        indexStatus: 'PROCESSING',
      },
    });

    return count === 1;
  }
}
