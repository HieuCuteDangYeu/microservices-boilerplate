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

  async onModuleDestroy() {
    await this.$disconnect();
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

  async updateReelStatus(
    id: string,
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED',
    transcript?: string,
    embedding?: number[],
  ): Promise<Reel> {
    const updatedRecord = await this.reel.update({
      where: { id },
      data: {
        status,
        ...(transcript !== undefined && { transcript }),
      },
    });

    if (embedding && embedding.length > 0) {
      const vectorString = `[${embedding.join(',')}]`;

      await this.$executeRaw`
        UPDATE "Reel" 
        SET embedding = ${vectorString}::vector 
        WHERE id = ${id}
      `;
    }

    const updatedReel = new Reel();
    updatedReel.id = updatedRecord.id;
    updatedReel.userId = updatedRecord.userId;
    updatedReel.mediaKey = updatedRecord.mediaKey;
    updatedReel.title = updatedRecord.title ?? undefined;
    updatedReel.description = updatedRecord.description ?? undefined;
    updatedReel.tags = updatedRecord.tags;
    updatedReel.status = updatedRecord.status as
      | 'PENDING'
      | 'PROCESSING'
      | 'COMPLETED'
      | 'FAILED';
    updatedReel.createdAt = updatedRecord.createdAt;
    updatedReel.updatedAt = updatedRecord.updatedAt;

    updatedReel.transcript = updatedRecord.transcript ?? undefined;
    if (embedding) {
      updatedReel.embedding = embedding;
    }

    return updatedReel;
  }

  async findById(id: string): Promise<Reel | null> {
    const record = await this.reel.findUnique({ where: { id } });

    if (!record) {
      return null;
    }

    const foundReel = new Reel();
    foundReel.id = record.id;
    foundReel.userId = record.userId;
    foundReel.mediaKey = record.mediaKey;
    foundReel.title = record.title ?? undefined;
    foundReel.description = record.description ?? undefined;
    foundReel.tags = record.tags;
    foundReel.status = record.status as
      | 'PENDING'
      | 'PROCESSING'
      | 'COMPLETED'
      | 'FAILED';
    foundReel.createdAt = record.createdAt;
    foundReel.updatedAt = record.updatedAt;

    return foundReel;
  }
}
