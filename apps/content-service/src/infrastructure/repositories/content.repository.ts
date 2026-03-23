import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/content-client';
import { Reel } from '../../domain/entities/reel.entity';
import { IContentRepository } from '../../domain/interfaces/content.repository.interface';

@Injectable()
export class ContentRepository
  extends PrismaClient
  implements OnModuleInit, IContentRepository
{
  async onModuleInit() {
    await this.$connect();
  }

  async createReel(reel: Partial<Reel>): Promise<Reel> {
    const savedRecord = await this.reel.create({
      data: {
        userId: reel.userId!,
        mediaKey: reel.mediaKey!,
        title: reel.title,
        description: reel.description,
        tags: reel.tags || [],
        status: reel.status || 'PENDING',
      },
    });

    const newReel = new Reel();
    newReel.id = savedRecord.id;
    newReel.userId = savedRecord.userId;
    newReel.mediaKey = savedRecord.mediaKey;
    newReel.title = savedRecord.title ?? undefined;
    newReel.description = savedRecord.description ?? undefined;
    newReel.tags = savedRecord.tags;
    newReel.status = savedRecord.status as
      | 'PENDING'
      | 'PROCESSING'
      | 'COMPLETED'
      | 'FAILED';
    newReel.createdAt = savedRecord.createdAt;
    newReel.updatedAt = savedRecord.updatedAt;

    return newReel;
  }
}
