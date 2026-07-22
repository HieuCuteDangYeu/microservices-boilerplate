import { TranscriptSegment } from '@common/ai/interfaces/transcription-result.interface';
import type { ExtractedReelMetadata } from '@common/ai/interfaces/reel-metadata-extraction.interface';
import { ReelChunkIndexInput } from '@common/content/interfaces/reel-chunk-index.interface';
import type { ReelMediaOutput } from '@common/processing/interfaces/reel-media-output.interface';
import {
  REEL_INDEX_JOB_EVENT_TYPE,
  REEL_INDEX_JOB_SCHEMA_VERSION,
  type ReelIndexJob,
} from '@common/processing/interfaces/reel-index-job.interface';
import { ReelContextSearchRequest } from '@common/content/interfaces/reel-context-search-request.interface';
import { ReelContextSearchResult } from '@common/content/interfaces/reel-context-search-result.interface';
import { OutboxEvent } from '@content/domain/entities/outbox-event.entity';
import { ReelShareLink } from '@content/domain/entities/reel-share-link.entity';
import { ReelShare } from '@content/domain/entities/reel-share.entity';
import type { ReelViewEvent as DomainReelViewEvent } from '@content/domain/entities/reel-view-event.entity';
import {
  IReelViewEventRepository,
  PersistReelViewEventsResult,
} from '@content/domain/interfaces/reel-view-event.repository.interface';
import type { IOutboxRepository } from '@content/domain/interfaces/outbox.repository.interface';
import { mapReelLegacyStatus } from '@content/domain/reel-status-compatibility.mapper';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/content-client';
import { randomUUID } from 'crypto';
import { Reel } from '../../domain/entities/reel.entity';
import {
  FriendsReelsQuery,
  IContentRepository,
  RecommendedReelsQuery,
  ReelChunkBackfillCursor,
  ReelChunkBackfillPage,
  ReelCursor,
  ReelListQuery,
  ReelProcessingMediaMetadata,
  ReelProfileContextQuery,
  ReelProfileContextResult,
  ReelMediaOutboxEventInput,
  ReelSearchQuery,
  ReelSearchResult,
  ReelShareCreateInput,
  ReelShareLinkCreateInput,
  ReelShareLinkWithReel,
  ReelUpdateData,
  SearchSuggestion,
  SearchSuggestionsQuery,
} from '../../domain/interfaces/content.repository.interface';

interface InsertedReelViewEventRow {
  eventId: string;
  reelId: string;
  userId: string;
  playbackSessionId: string;
  eventType: DomainReelViewEvent['eventType'];
  occurredAt: Date;
}

interface StartedReelViewSession {
  userId: string;
  playbackSessionId: string;
  startedAt: Date;
}

@Injectable()
export class ContentRepository
  extends PrismaClient
  implements
    OnModuleInit,
    IContentRepository,
    IReelViewEventRepository,
    IOutboxRepository
{
  constructor(private readonly configService: ConfigService) {
    super();
  }

  private readonly reelListSelect = {
    id: true,
    userId: true,
    mediaKey: true,
    title: true,
    description: true,
    tags: true,
    status: true,
    mediaStatus: true,
    indexStatus: true,
    visibility: true,
    viewCount: true,
    thumbnailKey: true,
    hlsMasterKey: true,
    transcriptionAudioManifestKey: true,
    mediaOutput: true,
    processingStage: true,
    processingMessage: true,
    processingProgress: true,
    processingAttemptId: true,
    processingStartedAt: true,
    processingFailedAt: true,
    processingCompletedAt: true,
    processingErrorCode: true,
    processingErrorDetail: true,
    mediaAttemptId: true,
    indexAttemptId: true,
    sourceDurationMs: true,
    sourceWidth: true,
    sourceHeight: true,
    sourceFps: true,
    sourceBitrateKbps: true,
    sourceHasAudio: true,
    sourceRotation: true,
    sourceOrientation: true,
    sourceLengthClass: true,
    sourceAspectRatio: true,
    sourceEffectiveWidth: true,
    sourceEffectiveHeight: true,
    encodedVariantCount: true,
    encodedMaxHeight: true,
    encodedFps: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  private getSearchNumber(
    key: string,
    fallback: number,
    min: number,
    max: number,
  ): number {
    const value = Number(this.configService.get<string>(key) ?? fallback);

    if (!Number.isFinite(value)) {
      return fallback;
    }

    return Math.min(Math.max(value, min), max);
  }

  private getSearchInteger(
    key: string,
    fallback: number,
    min: number,
    max: number,
  ): number {
    return Math.round(this.getSearchNumber(key, fallback, min, max));
  }

  private getNormalizedSearchWeights(): {
    vectorWeight: number;
    keywordWeight: number;
    metadataWeight: number;
  } {
    const vector = this.getSearchNumber(
      'CONTENT_RAG_VECTOR_WEIGHT',
      0.62,
      0,
      1,
    );
    const keyword = this.getSearchNumber(
      'CONTENT_RAG_KEYWORD_WEIGHT',
      0.28,
      0,
      1,
    );
    const metadata = this.getSearchNumber(
      'CONTENT_RAG_METADATA_WEIGHT',
      0.1,
      0,
      1,
    );

    const total = vector + keyword + metadata;

    if (total <= 0) {
      return {
        vectorWeight: 0.62,
        keywordWeight: 0.28,
        metadataWeight: 0.1,
      };
    }

    return {
      vectorWeight: vector / total,
      keywordWeight: keyword / total,
      metadataWeight: metadata / total,
    };
  }

  private toDomain(record: Record<string, unknown>): Reel {
    const reel = new Reel();

    reel.id = record['id'] as string;
    reel.userId = record['userId'] as string;
    reel.mediaKey = record['mediaKey'] as string;
    reel.title = (record['title'] as string | null) ?? undefined;
    reel.description = (record['description'] as string | null) ?? undefined;
    reel.tags = (record['tags'] as string[]) ?? [];
    const persistedLegacyStatus = record['status'] as Reel['status'];
    reel.mediaStatus =
      (record['mediaStatus'] as Reel['mediaStatus'] | undefined) ??
      (persistedLegacyStatus === 'COMPLETED'
        ? 'COMPLETED'
        : persistedLegacyStatus === 'FAILED'
          ? 'FAILED'
          : persistedLegacyStatus === 'PROCESSING'
            ? 'PROCESSING'
            : 'PENDING');
    reel.indexStatus =
      (record['indexStatus'] as Reel['indexStatus'] | undefined) ??
      (persistedLegacyStatus === 'COMPLETED' ? 'COMPLETED' : 'NOT_REQUESTED');
    reel.status = mapReelLegacyStatus({
      mediaStatus: reel.mediaStatus,
      indexStatus: reel.indexStatus,
    });
    reel.visibility = (record['visibility'] as Reel['visibility']) ?? 'public';
    reel.viewCount = record['viewCount'] as bigint;
    reel.transcript = (record['transcript'] as string | null) ?? undefined;
    reel.transcriptVtt =
      (record['transcriptVtt'] as string | null) ?? undefined;
    reel.transcriptSegments =
      (record['transcriptSegments'] as TranscriptSegment[] | null) ?? undefined;
    reel.thumbnailKey = (record['thumbnailKey'] as string | null) ?? undefined;
    reel.hlsMasterKey = (record['hlsMasterKey'] as string | null) ?? undefined;
    reel.transcriptionAudioManifestKey =
      (record['transcriptionAudioManifestKey'] as string | null) ?? undefined;
    reel.mediaOutput =
      (record['mediaOutput'] as ReelMediaOutput | null) ?? undefined;
    reel.processingStage =
      (record['processingStage'] as string | null) ?? undefined;
    reel.processingMessage =
      (record['processingMessage'] as string | null) ?? undefined;
    reel.processingProgress =
      (record['processingProgress'] as number | null) ?? undefined;
    reel.processingAttemptId =
      (record['processingAttemptId'] as string | null) ?? undefined;
    reel.processingStartedAt =
      (record['processingStartedAt'] as Date | null) ?? undefined;
    reel.processingFailedAt =
      (record['processingFailedAt'] as Date | null) ?? undefined;
    reel.processingCompletedAt =
      (record['processingCompletedAt'] as Date | null) ?? undefined;
    reel.processingErrorCode =
      (record['processingErrorCode'] as string | null) ?? undefined;
    reel.processingErrorDetail =
      (record['processingErrorDetail'] as string | null) ?? undefined;
    reel.mediaAttemptId =
      (record['mediaAttemptId'] as string | null) ?? undefined;
    reel.indexAttemptId =
      (record['indexAttemptId'] as string | null) ?? undefined;
    reel.sourceDurationMs =
      (record['sourceDurationMs'] as number | null) ?? undefined;
    reel.sourceWidth = (record['sourceWidth'] as number | null) ?? undefined;
    reel.sourceHeight = (record['sourceHeight'] as number | null) ?? undefined;
    reel.sourceFps = (record['sourceFps'] as number | null) ?? undefined;
    reel.sourceBitrateKbps =
      (record['sourceBitrateKbps'] as number | null) ?? undefined;
    reel.sourceHasAudio =
      (record['sourceHasAudio'] as boolean | null) ?? undefined;
    reel.sourceRotation =
      (record['sourceRotation'] as number | null) ?? undefined;
    reel.sourceOrientation =
      (record['sourceOrientation'] as Reel['sourceOrientation'] | null) ??
      undefined;
    reel.sourceLengthClass =
      (record['sourceLengthClass'] as Reel['sourceLengthClass'] | null) ??
      undefined;
    reel.sourceAspectRatio =
      (record['sourceAspectRatio'] as number | null) ?? undefined;
    reel.sourceEffectiveWidth =
      (record['sourceEffectiveWidth'] as number | null) ?? undefined;
    reel.sourceEffectiveHeight =
      (record['sourceEffectiveHeight'] as number | null) ?? undefined;
    reel.encodedVariantCount =
      (record['encodedVariantCount'] as number | null) ?? undefined;
    reel.encodedMaxHeight =
      (record['encodedMaxHeight'] as number | null) ?? undefined;
    reel.encodedFps = (record['encodedFps'] as number | null) ?? undefined;
    reel.createdAt = record['createdAt'] as Date;
    reel.updatedAt = record['updatedAt'] as Date;

    return reel;
  }

  private toMediaMetadataData(
    metadata: ReelProcessingMediaMetadata,
  ): Record<string, unknown> {
    const data: Record<string, unknown> = {};

    for (const key of [
      'sourceDurationMs',
      'sourceWidth',
      'sourceHeight',
      'sourceFps',
      'sourceBitrateKbps',
      'sourceHasAudio',
      'sourceRotation',
      'sourceOrientation',
      'sourceLengthClass',
      'sourceAspectRatio',
      'sourceEffectiveWidth',
      'sourceEffectiveHeight',
      'encodedVariantCount',
      'encodedMaxHeight',
      'encodedFps',
    ] as const) {
      if (metadata[key] !== undefined) {
        data[key] = metadata[key];
      }
    }

    return data;
  }

  async createReelWithMediaJob(
    reel: Partial<Reel>,
    outboxEvent: ReelMediaOutboxEventInput,
  ): Promise<Reel> {
    const savedRecord = await this.$transaction(async (transaction) => {
      const record = await transaction.reel.create({
        data: {
          id: reel.id,
          userId: reel.userId!,
          mediaKey: reel.mediaKey!,
          title: reel.title,
          description: reel.description,
          tags: reel.tags || [],
          status: reel.status || 'PENDING',
          mediaStatus: reel.mediaStatus || 'PENDING',
          indexStatus: reel.indexStatus || 'NOT_REQUESTED',
          visibility: reel.visibility || 'public',
          processingStage: reel.processingStage,
          processingMessage: reel.processingMessage,
          processingProgress: reel.processingProgress,
          processingAttemptId: reel.processingAttemptId,
          processingStartedAt: reel.processingStartedAt,
          processingFailedAt: reel.processingFailedAt,
          processingCompletedAt: reel.processingCompletedAt,
          processingErrorCode: reel.processingErrorCode,
          processingErrorDetail: reel.processingErrorDetail,
          mediaAttemptId: reel.mediaAttemptId,
          indexAttemptId: reel.indexAttemptId,
          sourceDurationMs: reel.sourceDurationMs,
          sourceWidth: reel.sourceWidth,
          sourceHeight: reel.sourceHeight,
          sourceFps: reel.sourceFps,
          sourceBitrateKbps: reel.sourceBitrateKbps,
          sourceHasAudio: reel.sourceHasAudio,
          sourceRotation: reel.sourceRotation,
          sourceOrientation: reel.sourceOrientation,
          sourceLengthClass: reel.sourceLengthClass,
          sourceAspectRatio: reel.sourceAspectRatio,
          sourceEffectiveWidth: reel.sourceEffectiveWidth,
          sourceEffectiveHeight: reel.sourceEffectiveHeight,
          encodedVariantCount: reel.encodedVariantCount,
          encodedMaxHeight: reel.encodedMaxHeight,
          encodedFps: reel.encodedFps,
        },
      });

      await transaction.outboxEvent.create({
        data: {
          id: outboxEvent.id,
          aggregateType: 'REEL',
          aggregateId: record.id,
          eventType: outboxEvent.eventType,
          payload: outboxEvent.payload as unknown as Prisma.InputJsonValue,
          createdAt: outboxEvent.createdAt,
          nextAttemptAt: outboxEvent.createdAt,
        },
      });

      return record;
    });

    return this.toDomain(savedRecord);
  }

  async queueReelProcessingAttemptWithMediaJob(
    reelId: string,
    mediaAttemptId: string,
    indexAttemptId: string,
    outboxEvent: ReelMediaOutboxEventInput,
  ): Promise<Reel> {
    const record = await this.$transaction(async (transaction) => {
      const queuedRecord = await transaction.reel.update({
        where: { id: reelId },
        data: {
          status: 'PENDING',
          mediaStatus: 'PENDING',
          indexStatus: 'NOT_REQUESTED',
          processingStage: 'QUEUED',
          processingMessage: 'Queued for processing',
          processingProgress: 0,
          processingAttemptId: mediaAttemptId,
          mediaAttemptId,
          indexAttemptId,
          processingStartedAt: null,
          processingFailedAt: null,
          processingCompletedAt: null,
          processingErrorCode: null,
          processingErrorDetail: null,
        },
      });

      await transaction.outboxEvent.create({
        data: {
          id: outboxEvent.id,
          aggregateType: 'REEL',
          aggregateId: reelId,
          eventType: outboxEvent.eventType,
          payload: outboxEvent.payload as unknown as Prisma.InputJsonValue,
          createdAt: outboxEvent.createdAt,
          nextAttemptAt: outboxEvent.createdAt,
        },
      });

      return queuedRecord;
    });

    return this.toDomain(record);
  }

  async claimProcessingAttempt(input: {
    reelId: string;
    processingAttemptId: string;
    allowReclaim?: boolean;
  }): Promise<boolean> {
    const result = await this.reel.updateMany({
      where: {
        id: input.reelId,
        mediaAttemptId: input.processingAttemptId,
        mediaStatus: input.allowReclaim
          ? { in: ['PENDING', 'PROCESSING'] }
          : 'PENDING',
      },
      data: {
        status: 'PROCESSING',
        mediaStatus: 'PROCESSING',
        processingStage: 'PROCESSING',
        processingMessage: 'Video is being processed',
        processingProgress: 10,
        processingStartedAt: new Date(),
        processingFailedAt: null,
        processingCompletedAt: null,
        processingErrorCode: null,
        processingErrorDetail: null,
      },
    });

    return result.count > 0;
  }

  async completeMediaProcessing(input: {
    reelId: string;
    mediaAttemptId: string;
    mediaMetadata: ReelProcessingMediaMetadata;
    mediaOutput: ReelMediaOutput;
  }): Promise<boolean> {
    return await this.$transaction(async (transaction) => {
      const completedAt = new Date();
      const result = await transaction.reel.updateMany({
        where: {
          id: input.reelId,
          mediaAttemptId: input.mediaAttemptId,
          mediaStatus: { in: ['PROBING', 'PROCESSING'] },
        },
        data: {
          status: 'COMPLETED',
          mediaStatus: 'COMPLETED',
          indexStatus: 'PENDING',
          thumbnailKey: input.mediaOutput.thumbnailKey,
          hlsMasterKey: input.mediaOutput.hlsMasterKey,
          transcriptionAudioManifestKey:
            input.mediaOutput.transcriptionAudioManifestKey,
          mediaOutput: input.mediaOutput as unknown as Prisma.InputJsonValue,
          processingStage: 'MEDIA_READY',
          processingMessage: 'Video is ready; indexing in progress',
          processingProgress: 90,
          processingCompletedAt: completedAt,
          processingFailedAt: null,
          processingErrorCode: null,
          processingErrorDetail: null,
          ...this.toMediaMetadataData(input.mediaMetadata),
        },
      });

      if (result.count === 0) return false;

      const reel = await transaction.reel.findUniqueOrThrow({
        where: { id: input.reelId },
      });

      if (!reel.indexAttemptId) {
        throw new Error(`Reel ${reel.id} has no index attempt ID`);
      }

      const jobId = randomUUID();
      const indexJob: ReelIndexJob = {
        jobId,
        reelId: reel.id,
        userId: reel.userId,
        mediaAttemptId: input.mediaAttemptId,
        indexAttemptId: reel.indexAttemptId,
        indexVersion:
          this.configService.get<string>('INDEX_VERSION')?.trim() ||
          'reel-index-v2',
        mediaKey: reel.mediaKey,
        transcriptionAudioManifestKey:
          input.mediaOutput.transcriptionAudioManifestKey,
        sourceDurationMs: input.mediaMetadata.sourceDurationMs!,
        sourceOrientation: input.mediaMetadata.sourceOrientation!,
        sourceLengthClass: input.mediaOutput.sourceLengthClass,
        title: reel.title ?? undefined,
        description: reel.description ?? undefined,
        tags: reel.tags,
        createdAt: completedAt.toISOString(),
        schemaVersion: REEL_INDEX_JOB_SCHEMA_VERSION,
      };

      await transaction.outboxEvent.create({
        data: {
          id: jobId,
          aggregateType: 'REEL',
          aggregateId: reel.id,
          eventType: REEL_INDEX_JOB_EVENT_TYPE,
          payload: indexJob as unknown as Prisma.InputJsonValue,
          createdAt: completedAt,
          nextAttemptAt: completedAt,
        },
      });

      return true;
    });
  }

  async updateMediaStatus(input: {
    reelId: string;
    mediaAttemptId: string;
    mediaStatus: Reel['mediaStatus'];
  }): Promise<boolean> {
    const current = await this.reel.findFirst({
      where: {
        id: input.reelId,
        mediaAttemptId: input.mediaAttemptId,
      },
      select: { indexStatus: true },
    });

    if (!current) {
      return false;
    }

    const result = await this.reel.updateMany({
      where: {
        id: input.reelId,
        mediaAttemptId: input.mediaAttemptId,
      },
      data: {
        mediaStatus: input.mediaStatus,
        status: mapReelLegacyStatus({
          mediaStatus: input.mediaStatus,
          indexStatus: current.indexStatus,
        }),
      },
    });

    return result.count > 0;
  }

  async updateIndexStatus(input: {
    reelId: string;
    indexAttemptId: string;
    indexStatus: Reel['indexStatus'];
  }): Promise<boolean> {
    const result = await this.reel.updateMany({
      where: {
        id: input.reelId,
        indexAttemptId: input.indexAttemptId,
        mediaStatus: 'COMPLETED',
      },
      data: { indexStatus: input.indexStatus },
    });

    return result.count > 0;
  }

  async claimIndexingAttempt(input: {
    reelId: string;
    indexAttemptId: string;
    allowReclaim?: boolean;
  }): Promise<boolean> {
    const result = await this.reel.updateMany({
      where: {
        id: input.reelId,
        indexAttemptId: input.indexAttemptId,
        mediaStatus: 'COMPLETED',
        indexStatus: input.allowReclaim
          ? { in: ['PENDING', 'PROCESSING'] }
          : 'PENDING',
      },
      data: {
        indexStatus: 'PROCESSING',
        processingStage: 'TRANSCRIBING_AUDIO_SEGMENTS',
        processingMessage: 'Video is ready; indexing in progress',
        processingProgress: 10,
        processingErrorCode: null,
        processingErrorDetail: null,
      },
    });
    return result.count > 0;
  }

  async reportIndexingProgress(input: {
    reelId: string;
    indexAttemptId: string;
    stage: string;
    progress: number;
  }): Promise<boolean> {
    const result = await this.reel.updateMany({
      where: {
        id: input.reelId,
        indexAttemptId: input.indexAttemptId,
        mediaStatus: 'COMPLETED',
        indexStatus: 'PROCESSING',
      },
      data: {
        processingStage: input.stage,
        processingMessage: 'Video is ready; indexing in progress',
        processingProgress: Math.min(
          100,
          Math.max(0, Math.round(input.progress)),
        ),
      },
    });
    return result.count > 0;
  }

  async completeIndexing(input: {
    reelId: string;
    indexAttemptId: string;
    transcript?: string;
    transcriptSegments?: TranscriptSegment[];
    metadata: ExtractedReelMetadata;
    chunks: ReelChunkIndexInput[];
  }): Promise<boolean> {
    return await this.$transaction(async (transaction) => {
      const current = await transaction.reel.findFirst({
        where: {
          id: input.reelId,
          indexAttemptId: input.indexAttemptId,
          mediaStatus: 'COMPLETED',
        },
      });
      if (!current) return false;
      if (
        current.indexStatus === 'COMPLETED' ||
        current.indexStatus === 'DEGRADED'
      ) {
        return true;
      }
      if (current.indexStatus !== 'PROCESSING') return false;

      const result = await transaction.reel.updateMany({
        where: {
          id: input.reelId,
          indexAttemptId: input.indexAttemptId,
          mediaStatus: 'COMPLETED',
          indexStatus: 'PROCESSING',
        },
        data: {
          ...(input.transcript !== undefined
            ? { transcript: input.transcript }
            : {}),
          ...(input.transcriptSegments !== undefined
            ? {
                transcriptSegments:
                  input.transcriptSegments as unknown as Prisma.InputJsonValue,
              }
            : {}),
          title: input.metadata.title ?? current.title,
          description: input.metadata.description ?? current.description,
          tags: input.metadata.tags,
          indexStatus: input.chunks.length > 0 ? 'COMPLETED' : 'DEGRADED',
          status: 'COMPLETED',
          processingStage: 'READY',
          processingMessage: 'Video is ready to watch',
          processingProgress: 100,
          processingErrorCode: null,
          processingErrorDetail: null,
        },
      });
      if (result.count === 0) return false;

      await transaction.reelChunk.deleteMany({
        where: { reelId: input.reelId },
      });
      if (input.chunks.length > 0) {
        const rows = input.chunks.map((chunk) => {
          if (!chunk.embedding.length) {
            throw new Error(
              `Chunk ${chunk.chunkIndex} has an invalid embedding`,
            );
          }
          return Prisma.sql`(
            ${randomUUID()}, ${input.reelId}, ${current.userId}, ${chunk.chunkIndex},
            ${chunk.text}, ${chunk.startTime ?? null}, ${chunk.endTime ?? null},
            ${chunk.embeddingModel}, ${`[${chunk.embedding.join(',')}]`}::vector
          )`;
        });
        await transaction.$executeRaw(Prisma.sql`
          INSERT INTO "ReelChunk" (
            "id", "reelId", "userId", "chunkIndex", "text", "startTime",
            "endTime", "embeddingModel", "embedding"
          ) VALUES ${Prisma.join(rows)}
        `);
      }
      return true;
    });
  }

  async failIndexing(input: {
    reelId: string;
    indexAttemptId: string;
    errorDetail: string;
  }): Promise<boolean> {
    const result = await this.reel.updateMany({
      where: {
        id: input.reelId,
        indexAttemptId: input.indexAttemptId,
        mediaStatus: 'COMPLETED',
        indexStatus: { in: ['PENDING', 'PROCESSING'] },
      },
      data: {
        status: 'COMPLETED',
        indexStatus: 'FAILED',
        processingStage: 'READY',
        processingMessage: 'Video is ready to watch',
        processingProgress: 100,
        processingFailedAt: new Date(),
        processingErrorCode: 'INDEXING_FAILED',
        processingErrorDetail: input.errorDetail.slice(0, 4000),
      },
    });
    return result.count > 0;
  }

  async queueReelIndexingAttempt(reelId: string): Promise<string | null> {
    return await this.$transaction(async (transaction) => {
      const reel = await transaction.reel.findFirst({
        where: { id: reelId, mediaStatus: 'COMPLETED' },
      });
      const mediaAttemptId = reel?.mediaAttemptId || reel?.processingAttemptId;
      if (
        !reel ||
        !mediaAttemptId ||
        !reel.sourceDurationMs ||
        !reel.sourceOrientation ||
        !reel.sourceLengthClass
      ) {
        return null;
      }

      const indexAttemptId = randomUUID();
      const result = await transaction.reel.updateMany({
        where: {
          id: reel.id,
          mediaStatus: 'COMPLETED',
          indexAttemptId: reel.indexAttemptId,
        },
        data: {
          indexAttemptId,
          indexStatus: 'PENDING',
          status: 'COMPLETED',
          processingStage: 'INDEX_QUEUED',
          processingMessage: 'Video is ready; indexing queued',
          processingProgress: 90,
          processingFailedAt: null,
          processingErrorCode: null,
          processingErrorDetail: null,
        },
      });
      if (result.count === 0) return null;

      const createdAt = new Date();
      const jobId = randomUUID();
      const indexJob: ReelIndexJob = {
        jobId,
        reelId: reel.id,
        userId: reel.userId,
        mediaAttemptId,
        indexAttemptId,
        indexVersion:
          this.configService.get<string>('INDEX_VERSION')?.trim() ||
          'reel-index-v2',
        mediaKey: reel.mediaKey,
        transcriptionAudioManifestKey:
          reel.transcriptionAudioManifestKey ?? undefined,
        sourceDurationMs: reel.sourceDurationMs,
        sourceOrientation: reel.sourceOrientation,
        sourceLengthClass: reel.sourceLengthClass,
        title: reel.title ?? undefined,
        description: reel.description ?? undefined,
        tags: reel.tags,
        createdAt: createdAt.toISOString(),
        schemaVersion: REEL_INDEX_JOB_SCHEMA_VERSION,
      };
      await transaction.outboxEvent.create({
        data: {
          id: jobId,
          aggregateType: 'REEL',
          aggregateId: reel.id,
          eventType: REEL_INDEX_JOB_EVENT_TYPE,
          payload: indexJob as unknown as Prisma.InputJsonValue,
          createdAt,
          nextAttemptAt: createdAt,
        },
      });
      return indexAttemptId;
    });
  }

  async claimPending(input: {
    limit: number;
    claimToken: string;
    staleBefore: Date;
  }): Promise<OutboxEvent[]> {
    const rows = await this.$queryRaw<
      Array<Record<string, unknown>>
    >(Prisma.sql`
      WITH candidates AS (
        SELECT "id"
        FROM "OutboxEvent"
        WHERE "publishedAt" IS NULL
          AND "nextAttemptAt" <= NOW()
          AND (
            "claimToken" IS NULL
            OR "claimedAt" IS NULL
            OR "claimedAt" < ${input.staleBefore}
          )
        ORDER BY "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${input.limit}
      )
      UPDATE "OutboxEvent" AS event
      SET "claimToken" = ${input.claimToken},
          "claimedAt" = NOW(),
          "attemptCount" = event."attemptCount" + 1
      FROM candidates
      WHERE event."id" = candidates."id"
      RETURNING event.*
    `);

    return rows.map((row) => this.toOutboxDomain(row));
  }

  async markPublished(input: {
    eventId: string;
    claimToken: string;
    publishedAt: Date;
  }): Promise<boolean> {
    const result = await this.outboxEvent.updateMany({
      where: {
        id: input.eventId,
        claimToken: input.claimToken,
        publishedAt: null,
      },
      data: {
        publishedAt: input.publishedAt,
        claimToken: null,
        claimedAt: null,
        lastError: null,
      },
    });

    return result.count > 0;
  }

  async markFailed(input: {
    eventId: string;
    claimToken: string;
    nextAttemptAt: Date;
    lastError: string;
  }): Promise<boolean> {
    const result = await this.outboxEvent.updateMany({
      where: {
        id: input.eventId,
        claimToken: input.claimToken,
        publishedAt: null,
      },
      data: {
        nextAttemptAt: input.nextAttemptAt,
        claimToken: null,
        claimedAt: null,
        lastError: input.lastError.slice(0, 4000),
      },
    });

    return result.count > 0;
  }

  private toOutboxDomain(record: Record<string, unknown>): OutboxEvent {
    const event = new OutboxEvent();

    event.id = record['id'] as string;
    event.aggregateType = record['aggregateType'] as string;
    event.aggregateId = record['aggregateId'] as string;
    event.eventType = record['eventType'] as string;
    event.payload = record['payload'];
    event.createdAt = record['createdAt'] as Date;
    event.publishedAt = (record['publishedAt'] as Date | null) ?? undefined;
    event.attemptCount = Number(record['attemptCount']) || 0;
    event.nextAttemptAt = record['nextAttemptAt'] as Date;
    event.claimToken = (record['claimToken'] as string | null) ?? undefined;
    event.claimedAt = (record['claimedAt'] as Date | null) ?? undefined;
    event.lastError = (record['lastError'] as string | null) ?? undefined;

    return event;
  }

  async updateReelStatus(
    id: string,
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED',
    transcript?: string,
    transcriptVtt?: string,
    transcriptSegments?: TranscriptSegment[],
    thumbnailKey?: string,
    processingStage?: string,
    processingMessage?: string,
    processingProgress?: number,
    chunks?: ReelChunkIndexInput[],
    title?: string,
    description?: string,
    tags?: string[],
    expectedProcessingAttemptId?: string,
    processingErrorCode?: string,
    processingErrorDetail?: string,
    mediaMetadata?: ReelProcessingMediaMetadata,
  ): Promise<Reel> {
    const updatedRecord = await this.$transaction(async (tx) => {
      const now = new Date();
      const currentRecord = await tx.reel.findUnique({ where: { id } });

      if (!currentRecord) {
        throw new Error(`Reel ${id} not found`);
      }

      if (
        expectedProcessingAttemptId?.trim() &&
        currentRecord.mediaAttemptId !== expectedProcessingAttemptId
      ) {
        return currentRecord;
      }

      const data: Record<string, unknown> = {};
      const isPostMediaUpdate = currentRecord.mediaStatus === 'COMPLETED';

      if (title !== undefined) data['title'] = title;
      if (description !== undefined) data['description'] = description;
      if (tags !== undefined) data['tags'] = tags;
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

      if (status === 'PROCESSING') {
        if (isPostMediaUpdate && processingStage === 'AI_ENRICHMENT') {
          data['status'] = 'COMPLETED';
          data['indexStatus'] = 'PROCESSING';
        } else {
          data['status'] = 'PROCESSING';
          data['mediaStatus'] =
            processingStage === 'PROBING_SOURCE' ? 'PROBING' : 'PROCESSING';
          data['processingStartedAt'] = now;
          data['processingFailedAt'] = null;
          data['processingCompletedAt'] = null;
          data['processingErrorCode'] = null;
          data['processingErrorDetail'] = null;
        }
      }

      if (status === 'PENDING') {
        data['status'] = 'PENDING';
        data['mediaStatus'] = 'PENDING';
      }

      if (status === 'COMPLETED') {
        data['status'] = 'COMPLETED';
        data['mediaStatus'] = 'COMPLETED';
        data['indexStatus'] =
          chunks && chunks.length > 0 ? 'COMPLETED' : 'DEGRADED';
        data['processingCompletedAt'] = now;
        data['processingFailedAt'] = null;
        data['processingErrorCode'] = null;
        data['processingErrorDetail'] = null;
        data['processingProgress'] = processingProgress ?? 100;
      }

      if (status === 'FAILED') {
        if (isPostMediaUpdate) {
          data['status'] = 'COMPLETED';
          data['indexStatus'] = 'FAILED';
          data['processingStage'] = 'READY';
          data['processingMessage'] = 'Video is ready to watch';
          data['processingProgress'] = 100;
          data['processingFailedAt'] = now;
          data['processingErrorCode'] =
            processingErrorCode ?? processingStage ?? 'INDEXING_FAILED';
          data['processingErrorDetail'] = processingErrorDetail;
        } else {
          data['status'] = 'FAILED';
          data['mediaStatus'] = 'FAILED';
          data['processingFailedAt'] = now;
          data['processingErrorCode'] =
            processingErrorCode ?? processingStage ?? 'FAILED';
          data['processingErrorDetail'] = processingErrorDetail;
        }
      }

      if (mediaMetadata) {
        Object.assign(data, this.toMediaMetadataData(mediaMetadata));
      }

      const where =
        expectedProcessingAttemptId &&
        expectedProcessingAttemptId.trim().length > 0
          ? {
              id,
              mediaAttemptId: expectedProcessingAttemptId,
            }
          : {
              id,
            };

      const updateResult = await tx.reel.updateMany({
        where,
        data,
      });

      if (updateResult.count === 0) {
        return currentRecord;
      }

      if (chunks && status === 'COMPLETED') {
        await tx.reelChunk.deleteMany({
          where: {
            reelId: id,
          },
        });

        if (chunks.length > 0) {
          const rows = chunks.map((chunk) => {
            const chunkId = randomUUID();

            if (
              !Array.isArray(chunk.embedding) ||
              chunk.embedding.length === 0
            ) {
              throw new Error(
                `Chunk ${chunk.chunkIndex} has an invalid embedding`,
              );
            }

            const embedding = `[${chunk.embedding.join(',')}]`;

            return Prisma.sql`(
        ${chunkId},
        ${id},
        ${currentRecord.userId},
        ${chunk.chunkIndex},
        ${chunk.text},
        ${chunk.startTime ?? null},
        ${chunk.endTime ?? null},
        ${chunk.embeddingModel},
        ${embedding}::vector
      )`;
          });

          await tx.$executeRaw(
            Prisma.sql`
        INSERT INTO "ReelChunk" (
          "id",
          "reelId",
          "userId",
          "chunkIndex",
          "text",
          "startTime",
          "endTime",
          "embeddingModel",
          "embedding"
        )
        VALUES ${Prisma.join(rows)}
      `,
          );
        }
      }

      return await tx.reel.findUniqueOrThrow({
        where: { id },
      });
    });

    return this.toDomain(updatedRecord);
  }

  async findById(id: string): Promise<Reel | null> {
    const record = await this.reel.findUnique({ where: { id } });
    if (!record) return null;
    return this.toDomain(record);
  }

  async shareReel(input: ReelShareCreateInput): Promise<ReelShare> {
    const record = await this.reelShare.create({
      data: {
        reelId: input.reelId,
        ownerId: input.ownerId,
        sharedByUserId: input.sharedByUserId,
        sharedWithUserId: input.sharedWithUserId,
        conversationId: input.conversationId,
        messageId: input.messageId,
      },
    });

    return this.toReelShareDomain(record);
  }

  async updateReelShareMessageId(
    shareId: string,
    messageId: string,
  ): Promise<ReelShare> {
    const record = await this.reelShare.update({
      where: { id: shareId },
      data: { messageId },
    });

    return this.toReelShareDomain(record);
  }

  async searchReelContext(
    input: ReelContextSearchRequest,
  ): Promise<ReelContextSearchResult[]> {
    const vectorLiteral = `[${input.queryVector.join(',')}]`;
    const queryText = input.queryText.trim();

    const maxDistance = this.getSearchNumber(
      'CONTENT_RAG_MAX_DISTANCE',
      0.65,
      0,
      2,
    );
    const candidateLimit = this.getSearchInteger(
      'CONTENT_RAG_CANDIDATE_LIMIT',
      50,
      10,
      200,
    );
    const finalLimit = Math.min(Math.max(input.limit ?? 8, 1), 20);

    const { vectorWeight, keywordWeight, metadataWeight } =
      this.getNormalizedSearchWeights();

    const sharedOnly = input.sharedOnly === true;
    const conversationId = input.conversationId ?? null;

    return this.$queryRaw<ReelContextSearchResult[]>`
    WITH vector_candidates AS (
      SELECT
        rc.id AS "chunkId",
        rc."reelId" AS "reelId",
        r.title AS title,
        r.description AS description,
        r.tags AS tags,
        rc.text AS "chunkText",
        rc."startTime" AS "startTime",
        rc."endTime" AS "endTime",
        r."createdAt" AS "createdAt",
        r."viewCount" AS "viewCount",
        (rc.embedding <=> ${vectorLiteral}::vector)::float AS distance,
        (1.0 - LEAST((rc.embedding <=> ${vectorLiteral}::vector)::float, 1.0))::float AS "vectorScore",
        0.0::float AS "keywordScore"
      FROM "ReelChunk" rc
      INNER JOIN "Reel" r ON r.id = rc."reelId"
      WHERE r."mediaStatus" = 'COMPLETED'
        AND r."indexStatus" = 'COMPLETED'
        AND rc.embedding IS NOT NULL
        AND (
          ${sharedOnly} = false
          OR (
            ${conversationId}::text IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM "ReelShare" rs
              WHERE rs."reelId" = r.id
                AND rs."conversationId" = ${conversationId}
            )
          )
        )
        AND (
          ${sharedOnly} = true
          OR r.visibility = 'public'
          OR r."userId" = ${input.userId}
        )
        AND (rc.embedding <=> ${vectorLiteral}::vector)::float <= ${maxDistance}
      ORDER BY distance ASC
      LIMIT ${candidateLimit}
    ),

    keyword_candidates AS (
      SELECT
        rc.id AS "chunkId",
        rc."reelId" AS "reelId",
        r.title AS title,
        r.description AS description,
        r.tags AS tags,
        rc.text AS "chunkText",
        rc."startTime" AS "startTime",
        rc."endTime" AS "endTime",
        r."createdAt" AS "createdAt",
        r."viewCount" AS "viewCount",
        NULL::float AS distance,
        0.0::float AS "vectorScore",
        (
          ts_rank_cd(
            to_tsvector('simple', coalesce(rc.text, '')),
            plainto_tsquery('simple', ${queryText})
          )
          +
          ts_rank_cd(
            to_tsvector(
              'simple',
              coalesce(r.title, '') || ' ' || coalesce(r.description, '')
            ),
            plainto_tsquery('simple', ${queryText})
          )
          +
          CASE
            WHEN EXISTS (
              SELECT 1
              FROM unnest(r.tags) AS tag(value)
              WHERE tag.value ILIKE '%' || ${queryText} || '%'
            )
            THEN 0.25
            ELSE 0
          END
        )::float AS "keywordScore"
      FROM "ReelChunk" rc
      INNER JOIN "Reel" r ON r.id = rc."reelId"
      WHERE r."mediaStatus" = 'COMPLETED'
        AND r."indexStatus" = 'COMPLETED'
        AND (
          ${sharedOnly} = false
          OR (
            ${conversationId}::text IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM "ReelShare" rs
              WHERE rs."reelId" = r.id
                AND rs."conversationId" = ${conversationId}
            )
          )
        )
        AND (
          ${sharedOnly} = true
          OR r.visibility = 'public'
          OR r."userId" = ${input.userId}
        )
        AND (
          to_tsvector('simple', coalesce(rc.text, ''))
            @@ plainto_tsquery('simple', ${queryText})
          OR
          to_tsvector(
            'simple',
            coalesce(r.title, '') || ' ' || coalesce(r.description, '')
          )
            @@ plainto_tsquery('simple', ${queryText})
          OR
          EXISTS (
            SELECT 1
            FROM unnest(r.tags) AS tag(value)
            WHERE tag.value ILIKE '%' || ${queryText} || '%'
          )
        )
      ORDER BY "keywordScore" DESC
      LIMIT ${candidateLimit}
    ),

    merged AS (
      SELECT * FROM vector_candidates
      UNION ALL
      SELECT * FROM keyword_candidates
    ),

    grouped AS (
      SELECT
        "chunkId",
        "reelId",
        title,
        description,
        tags,
        "chunkText",
        "startTime",
        "endTime",
        "createdAt",
        "viewCount",
        MIN(distance) AS distance,
        MAX("vectorScore") AS "vectorScore",
        MAX("keywordScore") AS "keywordScore"
      FROM merged
      GROUP BY
        "chunkId",
        "reelId",
        title,
        description,
        tags,
        "chunkText",
        "startTime",
        "endTime",
        "createdAt",
        "viewCount"
    ),

    scored AS (
      SELECT
        *,
        (
          (
            1.0 / (
              1.0 +
              (
                GREATEST(
                  EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - "createdAt")) / 86400.0,
                  0.0
                ) / 30.0
              )
            )
          ) * 0.55
          +
          (
            LEAST(
              LN(COALESCE("viewCount", 0)::float + 1.0) / LN(1001.0),
              1.0
            )
          ) * 0.45
        )::float AS "metadataScore"
      FROM grouped
    )

    SELECT
      "chunkId",
      "reelId",
      title,
      description,
      tags,
      "chunkText",
      "startTime",
      "endTime",
      distance,
      "vectorScore",
      "keywordScore",
      "metadataScore",
      (
        ("vectorScore" * ${vectorWeight}) +
        (LEAST("keywordScore", 1.0) * ${keywordWeight}) +
        ("metadataScore" * ${metadataWeight})
      )::float AS score,
      CASE
        WHEN "vectorScore" > 0 AND "keywordScore" > 0 THEN 'HYBRID'
        WHEN "keywordScore" > 0 THEN 'KEYWORD'
        ELSE 'VECTOR'
      END AS "matchedBy"
    FROM scored
    ORDER BY score DESC, distance ASC NULLS LAST
    LIMIT ${finalLimit};
  `;
  }

  async searchPublicReels(query: ReelSearchQuery): Promise<ReelSearchResult[]> {
    const searchText = query.query.trim();

    if (searchText.length === 0) {
      return [];
    }

    const limit = Math.min(Math.max(query.limit ?? 12, 1), 30);

    const rows = await this.$queryRaw<
      {
        id: string;
        score: number;
      }[]
    >`
    WITH chunk_scores AS (
      SELECT
        rc."reelId" AS id,
        MAX(
          ts_rank_cd(
            to_tsvector('simple', coalesce(rc.text, '')),
            plainto_tsquery('simple', ${searchText})
          )
        )::float AS "chunkRank",
        MAX(
          CASE
            WHEN rc.text ILIKE '%' || ${searchText} || '%' THEN 0.35
            ELSE 0
          END
        )::float AS "chunkPhraseScore"
      FROM "ReelChunk" rc
      INNER JOIN "Reel" indexed_reel
        ON indexed_reel.id = rc."reelId"
        AND indexed_reel."indexStatus" = 'COMPLETED'
      GROUP BY rc."reelId"
    ),

    scored AS (
      SELECT
        r.id,
        (
          (
            ts_rank_cd(
              to_tsvector(
                'simple',
                coalesce(r.title, '') || ' ' || coalesce(r.description, '')
              ),
              plainto_tsquery('simple', ${searchText})
            )
          ) * 0.42

          +

          (
            CASE
              WHEN lower(coalesce(r.title, '')) = lower(${searchText}) THEN 1.0
              WHEN lower(coalesce(r.title, '')) LIKE lower(${searchText}) || '%' THEN 0.9
              WHEN r.title ILIKE '%' || ${searchText} || '%' THEN 0.65
              ELSE 0
            END
          ) * 0.28

          +

          (
            CASE
              WHEN EXISTS (
                SELECT 1
                FROM unnest(r.tags) AS tag(value)
                WHERE tag.value ILIKE ${searchText}
              ) THEN 0.8
              WHEN EXISTS (
                SELECT 1
                FROM unnest(r.tags) AS tag(value)
                WHERE tag.value ILIKE '%' || ${searchText} || '%'
              ) THEN 0.55
              ELSE 0
            END
          ) * 0.18

          +

          (
            GREATEST(
              COALESCE(cs."chunkRank", 0),
              COALESCE(cs."chunkPhraseScore", 0)
            )
          ) * 0.32

          +

          (
            1.0 / (
              1.0 +
              (
                GREATEST(
                  EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - r."createdAt")) / 86400.0,
                  0.0
                ) / 30.0
              )
            )
          ) * 0.08

          +

          (
            LEAST(
              LN(COALESCE(r."viewCount", 0)::float + 1.0) / LN(1001.0),
              1.0
            )
          ) * 0.07
        )::float AS score
      FROM "Reel" r
      LEFT JOIN chunk_scores cs ON cs.id = r.id
      WHERE r."mediaStatus" = 'COMPLETED'
        AND r.visibility = 'public'
        AND (
          to_tsvector(
            'simple',
            coalesce(r.title, '') || ' ' || coalesce(r.description, '')
          ) @@ plainto_tsquery('simple', ${searchText})
          OR r.title ILIKE '%' || ${searchText} || '%'
          OR r.description ILIKE '%' || ${searchText} || '%'
          OR EXISTS (
            SELECT 1
            FROM unnest(r.tags) AS tag(value)
            WHERE tag.value ILIKE '%' || ${searchText} || '%'
          )
          OR COALESCE(cs."chunkRank", 0) > 0
          OR COALESCE(cs."chunkPhraseScore", 0) > 0
        )
    )

    SELECT id, score
    FROM scored
    WHERE score > 0
    ORDER BY score DESC, id ASC
    LIMIT ${limit};
  `;

    if (rows.length === 0) {
      return [];
    }

    const scoreById = new Map(rows.map((row) => [row.id, row.score]));
    const ids = rows.map((row) => row.id);

    const records = await this.reel.findMany({
      where: {
        id: { in: ids },
        mediaStatus: 'COMPLETED',
        visibility: 'public',
      },
      select: this.reelListSelect,
    });

    return records
      .map((record) => {
        const reel = this.toDomain(record);

        return {
          reel,
          score: scoreById.get(reel.id) ?? 0,
        };
      })
      .sort((left, right) => right.score - left.score);
  }

  private normalizeRecommendationTag(tag: string): string {
    return tag.trim().toLowerCase().replace(/^#/, '');
  }

  private stableRecommendationNoise(id: string): number {
    let hash = 0;

    for (let index = 0; index < id.length; index += 1) {
      hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
    }

    return (hash % 1000) / 1000;
  }

  private getReelAgeHours(createdAt: Date): number {
    return Math.max(0, (Date.now() - createdAt.getTime()) / (1000 * 60 * 60));
  }

  private isPositiveRecommendationEvent(event: {
    eventType: string;
    percentageWatched?: number | null;
    completed?: boolean | null;
    replayed?: boolean | null;
  }): boolean {
    return (
      event.eventType === 'COMPLETE' ||
      event.eventType === 'REPLAY' ||
      event.completed === true ||
      event.replayed === true ||
      (event.percentageWatched ?? 0) >= 70
    );
  }

  private isNegativeRecommendationEvent(event: {
    eventType: string;
    skipped?: boolean | null;
    percentageWatched?: number | null;
  }): boolean {
    return (
      event.eventType === 'SKIP' ||
      event.skipped === true ||
      ((event.percentageWatched ?? 100) < 15 &&
        (event.eventType === 'WATCH_END' ||
          event.eventType === 'WATCH_PROGRESS'))
    );
  }

  private normalizeSearchSuggestionText(value: string): string | null {
    const normalized = value
      .normalize('NFKC')
      .trim()
      .replace(/^#+/, '')
      .replace(/[_-]+/g, ' ')
      .replace(/[^\p{L}\p{N}#+. ]/gu, ' ')
      .replace(/\s+/g, ' ')
      .toLowerCase();

    if (normalized.length < 2 || normalized.length > 32) {
      return null;
    }

    if (/^\d+$/.test(normalized)) {
      return null;
    }

    return normalized;
  }

  private addSearchSuggestionScore(
    map: Map<
      string,
      {
        label: string;
        query: string;
        source: SearchSuggestion['source'];
        score: number;
      }
    >,
    input: {
      label: string;
      query: string;
      source: SearchSuggestion['source'];
      score: number;
    },
  ): void {
    const existing = map.get(input.query);

    if (existing) {
      existing.score += input.score;
      return;
    }

    map.set(input.query, {
      label: input.label,
      query: input.query,
      source: input.source,
      score: input.score,
    });
  }

  async getSearchSuggestions(
    query: SearchSuggestionsQuery,
  ): Promise<SearchSuggestion[]> {
    const type = query.type ?? 'all';

    if (type === 'users') {
      return [];
    }

    const limit = Math.min(Math.max(query.limit ?? 8, 1), 12);
    const candidateLimit = Math.min(Math.max(limit * 80, 300), 1000);
    const now = Date.now();

    const records = await this.reel.findMany({
      where: {
        visibility: 'public',
        mediaStatus: 'COMPLETED',
        tags: {
          isEmpty: false,
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: candidateLimit,
      select: {
        id: true,
        tags: true,
        viewCount: true,
        createdAt: true,
      },
    });

    if (records.length === 0) {
      return [];
    }

    const suggestions = new Map<
      string,
      {
        label: string;
        query: string;
        source: SearchSuggestion['source'];
        score: number;
      }
    >();

    for (const record of records) {
      const ageDays = Math.max(
        0,
        (now - record.createdAt.getTime()) / (1000 * 60 * 60 * 24),
      );

      const freshnessScore = 1 / (1 + ageDays / 14);

      const viewCount =
        typeof record.viewCount === 'bigint'
          ? Number(record.viewCount)
          : Number(record.viewCount ?? 0);

      const popularityScore = Math.min(
        Math.log(viewCount + 1) / Math.log(1001),
        1,
      );

      const baseScore = 1 + freshnessScore * 0.35 + popularityScore * 0.4;

      for (const rawTag of record.tags ?? []) {
        const queryText = this.normalizeSearchSuggestionText(rawTag);

        if (!queryText) {
          continue;
        }

        const label = rawTag
          .normalize('NFKC')
          .trim()
          .replace(/^#+/, '')
          .replace(/[_-]+/g, ' ')
          .replace(/\s+/g, ' ');

        this.addSearchSuggestionScore(suggestions, {
          label: label || queryText,
          query: queryText,
          source: 'trending_reel_tag',
          score: baseScore,
        });
      }
    }

    return [...suggestions.values()]
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        return left.query.localeCompare(right.query);
      })
      .slice(0, limit)
      .map((suggestion) => ({
        label: suggestion.label,
        query: suggestion.query,
        source: suggestion.source,
        score: Number(suggestion.score.toFixed(4)),
      }));
  }

  async listRecommendedReels(query: RecommendedReelsQuery): Promise<{
    items: Reel[];
    nextCursor: ReelCursor | null;
  }> {
    const viewerId = query.viewerId?.trim();

    if (!viewerId) {
      return {
        items: [],
        nextCursor: null,
      };
    }

    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
    const candidateLimit = Math.min(Math.max(limit * 10, 80), 300);

    const excludedUserIds = [
      ...new Set(
        (query.excludedUserIds ?? []).map((id) => id.trim()).filter(Boolean),
      ),
    ];

    const where: Record<string, unknown> = {
      visibility: 'public',
      mediaStatus: 'COMPLETED',

      ...(excludedUserIds.length > 0
        ? {
            userId: {
              notIn: excludedUserIds,
            },
          }
        : {}),
    };

    if (query.cursor) {
      where['OR'] = [
        {
          createdAt: {
            lt: query.cursor.createdAt,
          },
        },
        {
          createdAt: query.cursor.createdAt,
          id: {
            gt: query.cursor.id,
          },
        },
      ];
    }

    const candidateRecords = await this.reel.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: candidateLimit + 1,
      select: this.reelListSelect,
    });

    const hasMore = candidateRecords.length > candidateLimit;
    const pageCandidates = candidateRecords.slice(0, candidateLimit);

    if (pageCandidates.length === 0) {
      return {
        items: [],
        nextCursor: null,
      };
    }

    const candidateIds = pageCandidates.map((record) => record.id);
    const eventSince = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const recentSince = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [candidateEvents, profileEvents] = await Promise.all([
      this.reelViewEvent.findMany({
        where: {
          userId: viewerId,
          reelId: { in: candidateIds },
          occurredAt: { gte: eventSince },
        },
        select: {
          reelId: true,
          eventType: true,
          watchMs: true,
          percentageWatched: true,
          skipped: true,
          completed: true,
          replayed: true,
          occurredAt: true,
        },
      }),

      this.reelViewEvent.findMany({
        where: {
          userId: viewerId,
          occurredAt: { gte: eventSince },
          OR: [
            { eventType: { in: ['COMPLETE', 'REPLAY', 'WATCH_END'] } },
            { completed: true },
            { replayed: true },
            { percentageWatched: { gte: 70 } },
          ],
        },
        orderBy: { occurredAt: 'desc' },
        take: 500,
        select: {
          eventType: true,
          percentageWatched: true,
          skipped: true,
          completed: true,
          replayed: true,
          reel: {
            select: {
              userId: true,
              tags: true,
            },
          },
        },
      }),
    ]);

    const statsByReel = new Map<
      string,
      {
        impressionCount: number;
        skipCount: number;
        completeCount: number;
        replayCount: number;
        totalWatchMs: number;
        maxPercentageWatched: number;
        latestSeenAt: number;
        recentlySeen: boolean;
      }
    >();

    for (const event of candidateEvents) {
      const current = statsByReel.get(event.reelId) ?? {
        impressionCount: 0,
        skipCount: 0,
        completeCount: 0,
        replayCount: 0,
        totalWatchMs: 0,
        maxPercentageWatched: 0,
        latestSeenAt: 0,
        recentlySeen: false,
      };

      if (
        event.eventType === 'IMPRESSION' ||
        event.eventType === 'WATCH_START'
      ) {
        current.impressionCount += 1;
      }

      if (this.isNegativeRecommendationEvent(event)) {
        current.skipCount += 1;
      }

      if (event.eventType === 'COMPLETE' || event.completed === true) {
        current.completeCount += 1;
      }

      if (event.eventType === 'REPLAY' || event.replayed === true) {
        current.replayCount += 1;
      }

      current.totalWatchMs += event.watchMs ?? 0;
      current.maxPercentageWatched = Math.max(
        current.maxPercentageWatched,
        event.percentageWatched ?? 0,
      );
      current.latestSeenAt = Math.max(
        current.latestSeenAt,
        event.occurredAt.getTime(),
      );
      current.recentlySeen =
        current.recentlySeen || event.occurredAt >= recentSince;

      statsByReel.set(event.reelId, current);
    }

    const tagAffinity = new Map<string, number>();
    const creatorAffinity = new Map<string, number>();

    for (const event of profileEvents) {
      if (!this.isPositiveRecommendationEvent(event)) {
        continue;
      }

      const reel = event.reel;

      if (!reel) {
        continue;
      }

      const eventWeight =
        event.eventType === 'REPLAY' || event.replayed === true
          ? 1.5
          : event.eventType === 'COMPLETE' || event.completed === true
            ? 1.2
            : 1.0;

      creatorAffinity.set(
        reel.userId,
        (creatorAffinity.get(reel.userId) ?? 0) + eventWeight,
      );

      for (const rawTag of reel.tags ?? []) {
        const tag = this.normalizeRecommendationTag(rawTag);

        if (!tag) {
          continue;
        }

        tagAffinity.set(tag, (tagAffinity.get(tag) ?? 0) + eventWeight);
      }
    }

    const maxTagAffinity = Math.max(1, ...Array.from(tagAffinity.values()));
    const maxCreatorAffinity = Math.max(
      1,
      ...Array.from(creatorAffinity.values()),
    );

    const scored = pageCandidates
      .map((record) => {
        const reel = this.toDomain(record);
        const stats = statsByReel.get(reel.id);
        const ageHours = this.getReelAgeHours(reel.createdAt);

        const freshnessScore = 1 / (1 + ageHours / 72);

        const popularityScore = Math.min(
          Math.log(Number(reel.viewCount ?? 0) + 1) / Math.log(5000),
          1,
        );

        const tagScore = Math.min(
          1,
          (reel.tags ?? []).reduce((sum, rawTag) => {
            const tag = this.normalizeRecommendationTag(rawTag);
            return sum + (tagAffinity.get(tag) ?? 0);
          }, 0) / maxTagAffinity,
        );

        const creatorScore = Math.min(
          1,
          (creatorAffinity.get(reel.userId) ?? 0) / maxCreatorAffinity,
        );

        const replayBoost = stats?.replayCount
          ? Math.min(0.25, stats.replayCount * 0.08)
          : 0;

        const watchBoost = stats?.maxPercentageWatched
          ? Math.min(0.15, stats.maxPercentageWatched / 1000)
          : 0;

        const impressionPenalty = stats?.impressionCount
          ? Math.min(0.22, stats.impressionCount * 0.06)
          : 0;

        const skipPenalty = stats?.skipCount
          ? Math.min(0.55, stats.skipCount * 0.18)
          : 0;

        const completePenalty = stats?.completeCount
          ? Math.min(0.32, stats.completeCount * 0.12)
          : 0;

        const recentPenalty = stats?.recentlySeen ? 0.45 : 0;

        const diversityNoise = this.stableRecommendationNoise(reel.id);

        const score =
          freshnessScore * 0.3 +
          popularityScore * 0.18 +
          tagScore * 0.25 +
          creatorScore * 0.1 +
          diversityNoise * 0.07 +
          replayBoost +
          watchBoost -
          impressionPenalty -
          skipPenalty -
          completePenalty -
          recentPenalty;

        return {
          reel,
          score,
          recentlySeen: stats?.recentlySeen === true,
        };
      })
      .filter((item) => {
        if (query.excludeRecentlySeen === false) {
          return true;
        }

        return !item.recentlySeen;
      });

    const fallbackScored =
      scored.length >= limit
        ? scored
        : pageCandidates.map((record) => {
            const reel = this.toDomain(record);
            const ageHours = this.getReelAgeHours(reel.createdAt);
            const freshnessScore = 1 / (1 + ageHours / 72);
            const popularityScore = Math.min(
              Math.log(Number(reel.viewCount ?? 0) + 1) / Math.log(5000),
              1,
            );

            return {
              reel,
              score:
                freshnessScore * 0.58 +
                popularityScore * 0.32 +
                this.stableRecommendationNoise(reel.id) * 0.1,
            };
          });

    fallbackScored.sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return right.reel.createdAt.getTime() - left.reel.createdAt.getTime();
    });

    const chronologicalLastRecord = pageCandidates[pageCandidates.length - 1];

    return {
      items: fallbackScored.slice(0, limit).map((item) => item.reel),
      nextCursor:
        hasMore && chronologicalLastRecord
          ? {
              createdAt: chronologicalLastRecord.createdAt,
              id: chronologicalLastRecord.id,
            }
          : null,
    };
  }

  async listReels(query: ReelListQuery): Promise<{
    items: Reel[];
    nextCursor: ReelCursor | null;
  }> {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);

    const shouldUseRankedPublicFeed =
      query.ranked === true &&
      Boolean(query.viewerId) &&
      !query.userId &&
      query.visibility === 'public' &&
      query.onlyPublished === true;

    if (shouldUseRankedPublicFeed) {
      return this.listRankedPublicReels({
        viewerId: query.viewerId!,
        limit,
        cursor: query.cursor,
      });
    }

    const where: Record<string, unknown> = {};

    if (query.visibility) {
      where['visibility'] = query.visibility;
    }

    if (query.userId) {
      where['userId'] = query.userId;
    }

    if (query.onlyPublished) {
      where['mediaStatus'] = 'COMPLETED';
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

  private async listRankedPublicReels(input: {
    viewerId: string;
    limit: number;
    cursor?: ReelCursor;
  }): Promise<{
    items: Reel[];
    nextCursor: ReelCursor | null;
  }> {
    const where: Record<string, unknown> = {
      visibility: 'public',
      mediaStatus: 'COMPLETED',
    };

    if (input.cursor) {
      where['OR'] = [
        { createdAt: { lt: input.cursor.createdAt } },
        {
          createdAt: input.cursor.createdAt,
          id: { gt: input.cursor.id },
        },
      ];
    }

    const records = await this.reel.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: input.limit + 1,
      select: this.reelListSelect,
    });

    const hasMore = records.length > input.limit;
    const pageRecords = records.slice(0, input.limit);

    if (pageRecords.length === 0) {
      return {
        items: [],
        nextCursor: null,
      };
    }

    const reelIds = pageRecords.map((record) => record.id);
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const viewerEvents = await this.reelViewEvent.findMany({
      where: {
        userId: input.viewerId,
        reelId: {
          in: reelIds,
        },
        occurredAt: {
          gte: since,
        },
      },
      select: {
        reelId: true,
        eventType: true,
        watchMs: true,
        percentageWatched: true,
        skipped: true,
        completed: true,
        replayed: true,
        occurredAt: true,
      },
    });

    const statsByReel = new Map<
      string,
      {
        impressionCount: number;
        skipCount: number;
        completeCount: number;
        replayCount: number;
        totalWatchMs: number;
        maxPercentageWatched: number;
        latestSeenAt: number;
      }
    >();

    for (const event of viewerEvents) {
      const current = statsByReel.get(event.reelId) ?? {
        impressionCount: 0,
        skipCount: 0,
        completeCount: 0,
        replayCount: 0,
        totalWatchMs: 0,
        maxPercentageWatched: 0,
        latestSeenAt: 0,
      };

      if (event.eventType === 'IMPRESSION') {
        current.impressionCount += 1;
      }

      if (event.eventType === 'SKIP' || event.skipped) {
        current.skipCount += 1;
      }

      if (event.eventType === 'COMPLETE' || event.completed) {
        current.completeCount += 1;
      }

      if (event.eventType === 'REPLAY' || event.replayed) {
        current.replayCount += 1;
      }

      current.totalWatchMs += event.watchMs ?? 0;
      current.maxPercentageWatched = Math.max(
        current.maxPercentageWatched,
        event.percentageWatched ?? 0,
      );
      current.latestSeenAt = Math.max(
        current.latestSeenAt,
        event.occurredAt.getTime(),
      );

      statsByReel.set(event.reelId, current);
    }

    const now = Date.now();

    const scored = pageRecords.map((record) => {
      const reel = this.toDomain(record);
      const stats = statsByReel.get(reel.id);

      const ageHours = Math.max(
        0,
        (now - reel.createdAt.getTime()) / (1000 * 60 * 60),
      );

      const freshnessScore = 1 / (1 + ageHours / 72);
      const popularityScore = Math.min(
        Math.log(Number(reel.viewCount ?? 0) + 1) / Math.log(1000),
        1,
      );

      const seenPenalty = stats?.impressionCount ? 0.42 : 0;
      const skipPenalty = stats?.skipCount
        ? Math.min(0.8, stats.skipCount * 0.32)
        : 0;
      const completedPenalty = stats?.completeCount ? 0.22 : 0;
      const replayBoost = stats?.replayCount
        ? Math.min(0.3, stats.replayCount * 0.12)
        : 0;

      const score =
        freshnessScore * 0.58 +
        popularityScore * 0.22 +
        replayBoost -
        seenPenalty -
        skipPenalty -
        completedPenalty;

      return {
        reel,
        score,
      };
    });

    scored.sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return right.reel.createdAt.getTime() - left.reel.createdAt.getTime();
    });

    const chronologicalLastRecord = pageRecords[pageRecords.length - 1];

    return {
      items: scored.map((item) => item.reel),
      nextCursor:
        hasMore && chronologicalLastRecord
          ? {
              createdAt: chronologicalLastRecord.createdAt,
              id: chronologicalLastRecord.id,
            }
          : null,
    };
  }

  async getProfileReelContext(
    query: ReelProfileContextQuery,
  ): Promise<ReelProfileContextResult> {
    const scopeWhere: Record<string, unknown> = {
      userId: query.anchor.userId,
      visibility: query.anchor.visibility,
    };

    if (query.anchor.visibility === 'public') {
      scopeWhere['mediaStatus'] = 'COMPLETED';
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

  async findReelsForChunkBackfill(
    limit: number,
    cursor?: ReelChunkBackfillCursor,
    reelId?: string,
  ): Promise<ReelChunkBackfillPage> {
    const safeLimit = Math.min(Math.max(limit, 1), 50);

    const where: Record<string, unknown> = {
      mediaStatus: 'COMPLETED',
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

      await tx.reel.updateMany({
        where: {
          id: reelId,
          mediaStatus: 'COMPLETED',
        },
        data: {
          indexStatus: chunks.length > 0 ? 'COMPLETED' : 'DEGRADED',
        },
      });
    });
  }

  private toReelShareDomain(record: Record<string, unknown>): ReelShare {
    return new ReelShare({
      id: record['id'] as string,
      reelId: record['reelId'] as string,
      ownerId: record['ownerId'] as string,
      sharedByUserId: record['sharedByUserId'] as string,
      sharedWithUserId:
        (record['sharedWithUserId'] as string | null | undefined) ?? null,
      conversationId: record['conversationId'] as string,
      messageId: (record['messageId'] as string | null | undefined) ?? null,
      createdAt: record['createdAt'] as Date,
      updatedAt: record['updatedAt'] as Date,
    });
  }

  private toReelShareLinkDomain(
    record: Record<string, unknown>,
  ): ReelShareLink {
    return new ReelShareLink({
      id: record['id'] as string,
      reelId: record['reelId'] as string,
      ownerId: record['ownerId'] as string,
      token: record['token'] as string,
      createdBy: record['createdBy'] as string,
      expiresAt: (record['expiresAt'] as Date | null | undefined) ?? null,
      revokedAt: (record['revokedAt'] as Date | null | undefined) ?? null,
      clickCount: record['clickCount'] as bigint,
      createdAt: record['createdAt'] as Date,
      updatedAt: record['updatedAt'] as Date,
    });
  }

  async createReelShareLink(
    input: ReelShareLinkCreateInput,
  ): Promise<ReelShareLink> {
    const record = await this.reelShareLink.create({
      data: {
        reelId: input.reelId,
        ownerId: input.ownerId,
        token: input.token,
        createdBy: input.createdBy,
        expiresAt: input.expiresAt,
      },
    });

    return this.toReelShareLinkDomain(record);
  }

  async findActiveReelShareLinkByReelAndCreator(input: {
    reelId: string;
    createdBy: string;
    now: Date;
  }): Promise<ReelShareLink | null> {
    const record = await this.reelShareLink.findFirst({
      where: {
        reelId: input.reelId,
        createdBy: input.createdBy,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: input.now } }],
      },
      orderBy: { createdAt: 'desc' },
    });

    return record ? this.toReelShareLinkDomain(record) : null;
  }

  async findReelShareLinkByToken(
    token: string,
  ): Promise<ReelShareLinkWithReel | null> {
    const record = await this.reelShareLink.findUnique({
      where: { token },
      include: { reel: true },
    });

    if (!record) {
      return null;
    }

    return {
      link: this.toReelShareLinkDomain(record),
      reel: this.toDomain(record.reel),
    };
  }

  async incrementReelShareLinkClickCount(id: string): Promise<ReelShareLink> {
    const record = await this.reelShareLink.update({
      where: { id },
      data: {
        clickCount: {
          increment: 1,
        },
      },
    });

    return this.toReelShareLinkDomain(record);
  }

  async revokeReelShareLink(input: {
    token: string;
    revokedByUserId: string;
  }): Promise<ReelShareLink | null> {
    const record = await this.reelShareLink.update({
      where: { token: input.token },
      data: {
        revokedAt: new Date(),
      },
    });

    return this.toReelShareLinkDomain(record);
  }

  async persist(
    events: DomainReelViewEvent[],
  ): Promise<PersistReelViewEventsResult> {
    if (events.length === 0) {
      return {
        accepted: 0,
        duplicates: 0,
        rejected: 0,
        countedViews: 0,
        rejectedEventIds: [],
      };
    }

    const userId = events[0].userId;

    const reelIds = [...new Set(events.map((event) => event.reelId))];

    const accessibleReels = await this.reel.findMany({
      where: {
        id: {
          in: reelIds,
        },
        mediaStatus: 'COMPLETED',
        OR: [
          {
            visibility: 'public',
          },
          {
            userId,
          },
        ],
      },
      select: {
        id: true,
      },
    });

    const accessibleReelIds = new Set(accessibleReels.map((reel) => reel.id));

    const acceptedCandidates = events.filter((event) =>
      accessibleReelIds.has(event.reelId),
    );

    const rejectedEvents = events.filter(
      (event) => !accessibleReelIds.has(event.reelId),
    );

    if (acceptedCandidates.length === 0) {
      return {
        accepted: 0,
        duplicates: 0,
        rejected: rejectedEvents.length,
        countedViews: 0,
        rejectedEventIds: rejectedEvents.map((event) => event.eventId),
      };
    }

    const persisted = await this.$transaction(async (transaction) => {
      const valueRows = acceptedCandidates.map((event) => {
        const recommendation = event.recommendation;

        return Prisma.sql`(
                ${event.eventId},
                ${event.reelId},
                ${event.userId},
                ${event.playbackSessionId},
                ${event.sequence},
                ${event.eventType}::"ReelViewEventType",
                ${event.source}::"ReelEventSource",
                ${event.watchMs},
                ${event.durationMs},
                ${event.percentageWatched},
                ${event.muted},
                ${event.completed},
                ${event.replayed},
                ${event.skipped},
                ${recommendation?.recommendationId ?? null},
                ${recommendation?.feedSessionId ?? null},
                ${recommendation?.algorithmVersion ?? null},
                ${recommendation?.candidateSource ?? null},
                ${recommendation?.rank ?? null},
                ${recommendation?.generatedAt ?? null},
                ${event.occurredAt}
              )`;
      });

      const insertedEvents = await transaction.$queryRaw<
        InsertedReelViewEventRow[]
      >(
        Prisma.sql`
              INSERT INTO "ReelViewEvent" (
                "eventId",
                "reelId",
                "userId",
                "playbackSessionId",
                "sequence",
                "eventType",
                "source",
                "watchMs",
                "durationMs",
                "percentageWatched",
                "muted",
                "completed",
                "replayed",
                "skipped",
                "recommendationId",
                "feedSessionId",
                "algorithmVersion",
                "candidateSource",
                "rank",
                "recommendationGeneratedAt",
                "occurredAt"
              )
              VALUES ${Prisma.join(valueRows)}
              ON CONFLICT DO NOTHING
              RETURNING
                "eventId",
                "reelId",
                "userId",
                "playbackSessionId",
                "eventType",
                "occurredAt"
            `,
      );

      const startedSessionsByReel = new Map<
        string,
        Map<string, StartedReelViewSession>
      >();

      for (const event of insertedEvents) {
        if (event.eventType !== 'WATCH_START') {
          continue;
        }

        const sessions =
          startedSessionsByReel.get(event.reelId) ??
          new Map<string, StartedReelViewSession>();

        const sessionKey = `${event.userId}:${event.playbackSessionId}`;

        const existing = sessions.get(sessionKey);

        if (!existing || event.occurredAt < existing.startedAt) {
          sessions.set(sessionKey, {
            userId: event.userId,
            playbackSessionId: event.playbackSessionId,
            startedAt: event.occurredAt,
          });
        }

        startedSessionsByReel.set(event.reelId, sessions);
      }

      let countedViews = 0;

      for (const [reelId, sessions] of startedSessionsByReel) {
        const createdSessions = await transaction.reelViewSession.createMany({
          data: [...sessions.values()].map((session) => ({
            reelId,
            userId: session.userId,
            playbackSessionId: session.playbackSessionId,
            startedAt: session.startedAt,
          })),
          skipDuplicates: true,
        });

        if (createdSessions.count === 0) {
          continue;
        }

        await transaction.reel.update({
          where: {
            id: reelId,
          },
          data: {
            viewCount: {
              increment: createdSessions.count,
            },
          },
        });

        countedViews += createdSessions.count;
      }

      return {
        inserted: insertedEvents.length,
        countedViews,
      };
    });

    return {
      accepted: persisted.inserted,
      duplicates: acceptedCandidates.length - persisted.inserted,
      rejected: rejectedEvents.length,
      countedViews: persisted.countedViews,
      rejectedEventIds: rejectedEvents.map((event) => event.eventId),
    };
  }

  async listFriendsReels(query: FriendsReelsQuery): Promise<{
    items: Reel[];
    nextCursor: ReelCursor | null;
  }> {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);

    const excludedSet = new Set(query.excludedUserIds ?? []);

    const eligibleFriendIds = [
      ...new Set(
        query.friendUserIds.filter(
          (friendUserId) => !excludedSet.has(friendUserId),
        ),
      ),
    ];

    if (eligibleFriendIds.length === 0) {
      return {
        items: [],
        nextCursor: null,
      };
    }

    const records = await this.reel.findMany({
      where: {
        userId: {
          in: eligibleFriendIds,
        },
        mediaStatus: 'COMPLETED',
        visibility: {
          in: ['public', 'friends'],
        },
        ...(query.cursor
          ? {
              OR: [
                {
                  createdAt: {
                    lt: query.cursor.createdAt,
                  },
                },
                {
                  createdAt: query.cursor.createdAt,
                  id: {
                    gt: query.cursor.id,
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
          id: 'asc',
        },
      ],
      take: limit + 1,
      select: this.reelListSelect,
    });

    const hasMore = records.length > limit;

    const items = records
      .slice(0, limit)
      .map((record) => this.toDomain(record));

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
}
