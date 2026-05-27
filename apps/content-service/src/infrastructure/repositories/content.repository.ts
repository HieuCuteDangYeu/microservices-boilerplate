import { TranscriptSegment } from '@common/ai/interfaces/transcription-result.interface';
import { ReelChunkIndexInput } from '@common/content/interfaces/reel-chunk-index.interface';
import { ReelContextSearchResult } from '@common/content/interfaces/reel-context-search-result.interface';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/content-client';
import { Reel } from '../../domain/entities/reel.entity';
import {
  IContentRepository,
  ReelChunkBackfillCursor,
  ReelChunkBackfillPage,
  ReelCursor,
  ReelListQuery,
  ReelProfileContextQuery,
  ReelProfileContextResult,
  ReelUpdateData,
} from '../../domain/interfaces/content.repository.interface';

@Injectable()
export class ContentRepository
  extends PrismaClient
  implements OnModuleInit, IContentRepository
{
  private readonly reelListSelect = {
    id: true,
    userId: true,
    mediaKey: true,
    title: true,
    description: true,
    tags: true,
    status: true,
    visibility: true,
    viewCount: true,
    thumbnailKey: true,
    processingStage: true,
    processingMessage: true,
    processingProgress: true,
    createdAt: true,
    updatedAt: true,
  } as const;

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
    reel.transcriptVtt =
      (record['transcriptVtt'] as string | null) ?? undefined;
    reel.transcriptSegments =
      (record['transcriptSegments'] as TranscriptSegment[] | null) ?? undefined;
    reel.thumbnailKey = (record['thumbnailKey'] as string | null) ?? undefined;
    reel.processingStage =
      (record['processingStage'] as string | null) ?? undefined;
    reel.processingMessage =
      (record['processingMessage'] as string | null) ?? undefined;
    reel.processingProgress =
      (record['processingProgress'] as number | null) ?? undefined;
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
        processingStage: reel.processingStage,
        processingMessage: reel.processingMessage,
        processingProgress: reel.processingProgress,
      },
    });

    return this.toDomain(savedRecord);
  }

  async updateReelStatus(
    id: string,
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED',
    transcript?: string,
    transcriptVtt?: string,
    transcriptSegments?: TranscriptSegment[],
    embedding?: number[],
    thumbnailKey?: string,
    processingStage?: string,
    processingMessage?: string,
    processingProgress?: number,
    chunks?: ReelChunkIndexInput[],
  ): Promise<Reel> {
    const updatedRecord = await this.$transaction(async (tx) => {
      const data: Record<string, unknown> = { status };

      if (transcript !== undefined) data['transcript'] = transcript;
      if (transcriptVtt !== undefined) data['transcriptVtt'] = transcriptVtt;
      if (transcriptSegments !== undefined) {
        data['transcriptSegments'] = transcriptSegments;
      }
      if (thumbnailKey !== undefined) data['thumbnailKey'] = thumbnailKey;
      if (processingStage !== undefined) {
        data['processingStage'] = processingStage;
      }
      if (processingMessage !== undefined) {
        data['processingMessage'] = processingMessage;
      }
      if (processingProgress !== undefined) {
        data['processingProgress'] = processingProgress;
      }

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

      if (chunks) {
        await tx.reelChunk.deleteMany({
          where: { reelId: id },
        });

        for (const chunk of chunks) {
          const created = await tx.reelChunk.create({
            data: {
              reelId: id,
              userId: record.userId,
              chunkIndex: chunk.chunkIndex,
              text: chunk.text,
              startTime: chunk.startTime,
              endTime: chunk.endTime,
              embeddingModel: chunk.embeddingModel,
            },
          });

          const chunkVectorString = `[${chunk.embedding.join(',')}]`;

          await tx.$executeRaw`
            UPDATE "ReelChunk"
            SET embedding = ${chunkVectorString}::vector
            WHERE id = ${created.id}
          `;
        }
      }

      return record;
    });

    return this.toDomain(updatedRecord);
  }

  async findById(id: string): Promise<Reel | null> {
    const record = await this.reel.findUnique({ where: { id } });
    if (!record) return null;
    return this.toDomain(record);
  }

  async searchReelContext(
    queryVector: number[],
    userId: string,
  ): Promise<ReelContextSearchResult[]> {
    const vectorLiteral = `[${queryVector.join(',')}]`;
    const maxDistance = 0.55;
    const limit = 8;

    return this.$queryRaw<ReelContextSearchResult[]>`
      WITH ranked_chunks AS (
        SELECT
          rc.id AS "chunkId",
          rc."reelId" AS "reelId",
          r.title AS title,
          r.description AS description,
          r.tags AS tags,
          rc.text AS "chunkText",
          rc."startTime" AS "startTime",
          rc."endTime" AS "endTime",
          (rc.embedding <=> ${vectorLiteral}::vector)::float AS distance
        FROM "ReelChunk" rc
        INNER JOIN "Reel" r ON r.id = rc."reelId"
        WHERE r.status = 'COMPLETED'
          AND rc.embedding IS NOT NULL
          AND (r.visibility = 'public' OR r."userId" = ${userId})
      )
      SELECT *
      FROM ranked_chunks
      WHERE distance <= ${maxDistance}
      ORDER BY distance ASC
      LIMIT ${limit};
    `;
  }

  async listReels(query: ReelListQuery): Promise<{
    items: Reel[];
    nextCursor: ReelCursor | null;
  }> {
    const limit = query.limit ?? 20;
    const where: Record<string, unknown> = {};

    if (query.visibility) {
      where['visibility'] = query.visibility;
    }

    if (query.userId) {
      where['userId'] = query.userId;
    }

    if (query.onlyPublished) {
      where['status'] = 'COMPLETED';
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
      select: this.reelListSelect,
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

  async getProfileReelContext(
    query: ReelProfileContextQuery,
  ): Promise<ReelProfileContextResult> {
    const scopeWhere: Record<string, unknown> = {
      userId: query.anchor.userId,
      visibility: query.anchor.visibility,
    };

    if (query.anchor.visibility === 'public') {
      scopeWhere['status'] = 'COMPLETED';
    }

    const [beforeRecords, afterRecords] = await Promise.all([
      this.reel.findMany({
        where: {
          ...scopeWhere,
          OR: [
            { createdAt: { gt: query.anchor.createdAt } },
            {
              createdAt: query.anchor.createdAt,
              id: { lt: query.anchor.id },
            },
          ],
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'desc' }],
        take: query.before + 1,
        select: this.reelListSelect,
      }),
      this.reel.findMany({
        where: {
          ...scopeWhere,
          OR: [
            { createdAt: { lt: query.anchor.createdAt } },
            {
              createdAt: query.anchor.createdAt,
              id: { gt: query.anchor.id },
            },
          ],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: query.after + 1,
        select: this.reelListSelect,
      }),
    ]);

    const hasMoreBefore = beforeRecords.length > query.before;
    const hasMoreAfter = afterRecords.length > query.after;

    const beforeItems = beforeRecords
      .slice(0, query.before)
      .map((record) =>
        this.toDomain(record as unknown as Record<string, unknown>),
      )
      .reverse();

    const afterItems = afterRecords
      .slice(0, query.after)
      .map((record) =>
        this.toDomain(record as unknown as Record<string, unknown>),
      );

    const items = [...beforeItems, query.anchor, ...afterItems];

    return {
      items,
      selectedIndex: beforeItems.length,
      previousCursor: hasMoreBefore ? this.toCursor(items[0]) : null,
      nextCursor: hasMoreAfter ? this.toCursor(items[items.length - 1]) : null,
    };
  }

  private toCursor(reel: Pick<Reel, 'createdAt' | 'id'>): ReelCursor {
    return {
      createdAt: reel.createdAt,
      id: reel.id,
    };
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

    return this.toDomain(updatedRecord);
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

    return this.toDomain(record);
  }

  async findReelsForChunkBackfill(
    limit: number,
    cursor?: ReelChunkBackfillCursor,
    reelId?: string,
  ): Promise<ReelChunkBackfillPage> {
    const safeLimit = Math.min(Math.max(limit, 1), 50);

    const where: Record<string, unknown> = {
      status: 'COMPLETED',
      transcript: { not: null },
      chunks: {
        none: {},
      },
    };

    if (reelId) {
      where['id'] = reelId;
    }

    if (cursor && !reelId) {
      where['OR'] = [
        {
          createdAt: {
            gt: cursor.createdAt,
          },
        },
        {
          createdAt: cursor.createdAt,
          id: {
            gt: cursor.id,
          },
        },
      ];
    }

    const records = await this.reel.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: safeLimit + 1,
      select: {
        id: true,
        userId: true,
        title: true,
        description: true,
        tags: true,
        transcript: true,
        transcriptSegments: true,
        createdAt: true,
      },
    });

    const hasMore = records.length > safeLimit;
    const items = records.slice(0, safeLimit).map((record) => ({
      id: record.id,
      userId: record.userId,
      title: record.title ?? undefined,
      description: record.description ?? undefined,
      tags: record.tags ?? [],
      transcript: record.transcript ?? undefined,
      transcriptSegments:
        (record.transcriptSegments as TranscriptSegment[] | null) ?? undefined,
      createdAt: record.createdAt,
    }));

    const lastItem = items[items.length - 1];

    return {
      items,
      nextCursor:
        hasMore && lastItem
          ? {
              createdAt: lastItem.createdAt,
              id: lastItem.id,
            }
          : null,
    };
  }

  async replaceReelChunks(
    reelId: string,
    userId: string,
    chunks: ReelChunkIndexInput[],
  ): Promise<void> {
    await this.$transaction(async (tx) => {
      await tx.reelChunk.deleteMany({
        where: {
          reelId,
        },
      });

      for (const chunk of chunks) {
        const created = await tx.reelChunk.create({
          data: {
            reelId,
            userId,
            chunkIndex: chunk.chunkIndex,
            text: chunk.text,
            startTime: chunk.startTime,
            endTime: chunk.endTime,
            embeddingModel: chunk.embeddingModel,
          },
        });

        const vectorString = `[${chunk.embedding.join(',')}]`;

        await tx.$executeRaw`
        UPDATE "ReelChunk"
        SET embedding = ${vectorString}::vector
        WHERE id = ${created.id}
      `;
      }
    });
  }
}
