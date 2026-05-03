import { TranscriptSearchResult } from '@common/content/interfaces/transcript-search-result.interface';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/content-client';
import { Reel } from '../../domain/entities/reel.entity';
import {
  IContentRepository,
  ReelListQuery,
  ReelUpdateData,
} from '../../domain/interfaces/content.repository.interface';

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

  private toDomain(record: Record<string, unknown>): Reel {
    const reel = new Reel();
    reel.id = record['id'] as string;
    reel.userId = record['userId'] as string;
    reel.mediaKey = record['mediaKey'] as string;
    reel.title = (record['title'] as string | null) ?? undefined;
    reel.description = (record['description'] as string | null) ?? undefined;
    reel.tags = (record['tags'] as string[]) ?? [];
    reel.status = record['status'] as Reel['status'];
    reel.visibility = (record['visibility'] as Reel['visibility']) ?? 'public';
    reel.viewCount = record['viewCount'] as bigint;
    reel.transcript = (record['transcript'] as string | null) ?? undefined;
    reel.thumbnailKey = (record['thumbnailKey'] as string | null) ?? undefined;
    reel.createdAt = record['createdAt'] as Date;
    reel.updatedAt = record['updatedAt'] as Date;
    return reel;
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
        visibility: reel.visibility || 'public',
      },
    });
    return this.toDomain(savedRecord as Record<string, unknown>);
  }

  async updateReelStatus(
    id: string,
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED',
    transcript?: string,
    embedding?: number[],
    thumbnailKey?: string,
  ): Promise<Reel> {
    const updatedRecord = await this.$transaction(async (tx) => {
      const data: Record<string, unknown> = { status };
      if (transcript !== undefined) data['transcript'] = transcript;
      if (thumbnailKey !== undefined) data['thumbnailKey'] = thumbnailKey;

      const record = await tx.reel.update({
        where: { id },
        data,
      });

      if (embedding && embedding.length > 0) {
        const vectorString = `[${embedding.join(',')}]`;
        await tx.$executeRaw`
          UPDATE "Reel"
          SET embedding = ${vectorString}::vector
          WHERE id = ${id}
        `;
      }

      return record;
    });

    return this.toDomain(updatedRecord as Record<string, unknown>);
  }

  async findById(id: string): Promise<Reel | null> {
    const record = await this.reel.findUnique({ where: { id } });
    if (!record) return null;
    return this.toDomain(record as Record<string, unknown>);
  }

  async searchTranscripts(
    queryVector: number[],
  ): Promise<TranscriptSearchResult[]> {
    const vectorLiteral = `[${queryVector.join(',')}]`;
    return this.$queryRaw<TranscriptSearchResult[]>`
        SELECT
          transcript,
          (embedding <=> ${vectorLiteral}::vector) as distance
        FROM "Reel"
        WHERE transcript IS NOT NULL
          AND embedding IS NOT NULL
        ORDER BY distance ASC
        LIMIT 3;
      `;
  }

  async listReels(query: ReelListQuery): Promise<{
    items: Reel[];
    nextCursor: { createdAt: Date; id: string } | null;
  }> {
    const limit = query.limit ?? 20;
    const where: Record<string, unknown> = {};

    if (query.visibility) {
      where['visibility'] = query.visibility;
    }
    if (query.userId) {
      where['userId'] = query.userId;
    }
    if (query.cursor) {
      where['OR'] = [
        { createdAt: { lt: query.cursor.createdAt } },
        {
          createdAt: query.cursor.createdAt,
          id: { gt: query.cursor.id },
        },
      ];
    }

    const records = await this.reel.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: limit + 1,
      select: {
        id: true,
        userId: true,
        mediaKey: true,
        title: true,
        tags: true,
        status: true,
        visibility: true,
        viewCount: true,
        thumbnailKey: true,
        createdAt: true,
        // transcript, embedding, description excluded from list query
      },
    });

    const hasMore = records.length > limit;
    const items = records
      .slice(0, limit)
      .map((r) => this.toDomain(r as unknown as Record<string, unknown>));

    const nextCursor =
      hasMore && items.length > 0
        ? {
            createdAt: items[items.length - 1].createdAt,
            id: items[items.length - 1].id,
          }
        : null;

    return { items, nextCursor };
  }

  async updateReel(
    id: string,
    data: ReelUpdateData,
    userId: string,
  ): Promise<Reel | null> {
    const reel = await this.reel.findUnique({ where: { id } });
    if (!reel) return null;
    if (reel.userId !== userId) return null;

    const updatedRecord = await this.reel.update({
      where: { id },
      data: {
        title: data.title !== undefined ? data.title : undefined,
        description:
          data.description !== undefined ? data.description : undefined,
        tags: data.tags !== undefined ? data.tags : undefined,
        visibility: data.visibility !== undefined ? data.visibility : undefined,
      },
    });

    return this.toDomain(updatedRecord as Record<string, unknown>);
  }

  async deleteReel(id: string, userId: string): Promise<boolean> {
    const reel = await this.reel.findUnique({ where: { id } });
    if (!reel) return false;
    if (reel.userId !== userId) return false;

    await this.reel.delete({ where: { id } });
    return true;
  }

  async incrementViewCount(id: string): Promise<Reel | null> {
    const record = await this.reel.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });
    if (!record) return null;
    return this.toDomain(record as Record<string, unknown>);
  }
}
