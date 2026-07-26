import type { ExtractedReelMetadata } from '@common/ai/interfaces/reel-metadata-extraction.interface';
import type { TranscriptSegment } from '@common/ai/interfaces/transcription-result.interface';
import type { IndexChunkCheckpoint } from '@common/processing/interfaces/index-chunk-checkpoint.interface';
import type { ReelIndexJob } from '@common/processing/interfaces/reel-index-job.interface';
import type {
  CachedEmbedding,
  EmbeddingCacheIdentity,
  ReelEvidenceDocumentDraft,
} from '@common/processing/interfaces/reel-index-document.interface';
import type { TranscriptionAudioArtifact } from '@common/processing/interfaces/transcription-audio-manifest.interface';
import type {
  AudioSegmentCheckpoint,
  IndexCheckpointStage,
  IndexJobCheckpoint,
  TranscriptSection,
} from '@indexing/domain/entities/index-checkpoint.entity';
import type { IIndexCheckpointRepository } from '@indexing/domain/interfaces/index-checkpoint.repository.interface';
import { PrismaService } from '@indexing/infrastructure/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/reel-indexing-client';

@Injectable()
export class PrismaIndexCheckpointRepository implements IIndexCheckpointRepository {
  constructor(private readonly prisma: PrismaService) {}

  async startOrResume(job: ReelIndexJob): Promise<IndexJobCheckpoint> {
    const record = await this.prisma.indexingAttempt.upsert({
      where: { indexAttemptId: job.indexAttemptId },
      create: {
        indexAttemptId: job.indexAttemptId,
        jobId: job.jobId,
        reelId: job.reelId,
        mediaAttemptId: job.mediaAttemptId,
        indexVersion: job.indexVersion,
      },
      update: {
        status: 'PROCESSING',
        lastError: null,
      },
    });

    return this.toCheckpoint(
      record,
      await this.loadAdditionalState(job.indexAttemptId),
    );
  }

  async get(indexAttemptId: string): Promise<IndexJobCheckpoint | null> {
    const record = await this.prisma.indexingAttempt.findUnique({
      where: { indexAttemptId },
    });
    return record
      ? this.toCheckpoint(
          record,
          await this.loadAdditionalState(indexAttemptId),
        )
      : null;
  }

  async setStage(
    indexAttemptId: string,
    stage: IndexCheckpointStage,
    data: Partial<IndexJobCheckpoint> = {},
  ): Promise<void> {
    await this.prisma.indexingAttempt.update({
      where: { indexAttemptId },
      data: {
        stage,
        ...(data.mergedTranscript !== undefined
          ? { mergedTranscript: data.mergedTranscript }
          : {}),
        ...(data.mergedSegments !== undefined
          ? {
              mergedSegments:
                data.mergedSegments as unknown as Prisma.InputJsonValue,
            }
          : {}),
        ...(data.extractedMetadata !== undefined
          ? {
              extractedMetadata:
                data.extractedMetadata as unknown as Prisma.InputJsonValue,
            }
          : {}),
        ...(data.sections !== undefined
          ? { sections: data.sections as unknown as Prisma.InputJsonValue }
          : {}),
        ...(data.chunks !== undefined
          ? { chunks: data.chunks as unknown as Prisma.InputJsonValue }
          : {}),
      },
    });
    if (data.documentDrafts !== undefined) {
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE "IndexingAttempt"
        SET "documentDrafts" = ${JSON.stringify(data.documentDrafts)}::jsonb
        WHERE "indexAttemptId" = ${indexAttemptId}
      `);
    }
    if (
      data.mergedTranscriptHash !== undefined ||
      data.mergeAlgorithmVersion !== undefined
    ) {
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE "IndexingAttempt"
        SET
          "mergedTranscriptHash" = coalesce(
            ${data.mergedTranscriptHash ?? null},
            "mergedTranscriptHash"
          ),
          "mergeAlgorithmVersion" = coalesce(
            ${data.mergeAlgorithmVersion ?? null},
            "mergeAlgorithmVersion"
          )
        WHERE "indexAttemptId" = ${indexAttemptId}
      `);
    }
  }

  async initializeAudioSegments(
    indexAttemptId: string,
    artifacts: TranscriptionAudioArtifact[],
    transcriptionIdentity: string,
  ): Promise<void> {
    await this.prisma.audioSegmentCheckpoint.createMany({
      data: artifacts.map((artifact, segmentNumber) => ({
        indexAttemptId,
        segmentNumber,
        artifactKey: artifact.key,
        artifactChecksum: artifact.checksum,
        startMs: artifact.startMs,
        endMs: artifact.endMs,
        overlapBeforeMs: artifact.overlapBeforeMs,
      })),
      skipDuplicates: true,
    });
    for (const [segmentNumber, artifact] of artifacts.entries()) {
      const identity = `${artifact.checksum}:${transcriptionIdentity}`;
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE "AudioSegmentCheckpoint"
        SET
          "artifactKey" = ${artifact.key},
          "artifactChecksum" = ${artifact.checksum},
          "startMs" = ${artifact.startMs},
          "endMs" = ${artifact.endMs},
          "overlapBeforeMs" = ${artifact.overlapBeforeMs},
          "transcriptionIdentity" = ${identity},
          "status" = 'PENDING',
          "attemptCount" = 0,
          "provider" = NULL,
          "transcriptionModel" = NULL,
          "transcriptionVersion" = NULL,
          "transcriptText" = NULL,
          "transcriptSegments" = NULL,
          "lastError" = NULL
        WHERE "indexAttemptId" = ${indexAttemptId}
          AND "segmentNumber" = ${segmentNumber}
          AND "transcriptionIdentity" IS DISTINCT FROM ${identity}
      `);
    }
  }

  async listAudioSegments(
    indexAttemptId: string,
  ): Promise<AudioSegmentCheckpoint[]> {
    const records = await this.prisma.audioSegmentCheckpoint.findMany({
      where: { indexAttemptId },
      orderBy: { segmentNumber: 'asc' },
    });
    return records.map((record) => this.toAudioSegment(record));
  }

  async markAudioSegmentProcessing(
    indexAttemptId: string,
    segmentNumber: number,
  ): Promise<void> {
    await this.prisma.audioSegmentCheckpoint.update({
      where: {
        indexAttemptId_segmentNumber: { indexAttemptId, segmentNumber },
      },
      data: {
        status: 'PROCESSING',
        attemptCount: { increment: 1 },
        lastError: null,
      },
    });
  }

  async completeAudioSegment(segment: AudioSegmentCheckpoint): Promise<void> {
    await this.prisma.audioSegmentCheckpoint.update({
      where: {
        indexAttemptId_segmentNumber: {
          indexAttemptId: segment.indexAttemptId,
          segmentNumber: segment.segmentNumber,
        },
      },
      data: {
        status: 'COMPLETED',
        provider: segment.provider,
        transcriptionModel: segment.transcriptionModel,
        transcriptionVersion: segment.transcriptionVersion,
        transcriptText: segment.transcriptText,
        ...(segment.transcriptSegments !== undefined
          ? {
              transcriptSegments:
                segment.transcriptSegments as unknown as Prisma.InputJsonValue,
            }
          : {}),
        lastError: null,
      },
    });
  }

  async failAudioSegment(input: {
    indexAttemptId: string;
    segmentNumber: number;
    error: string;
  }): Promise<void> {
    await this.prisma.audioSegmentCheckpoint.update({
      where: {
        indexAttemptId_segmentNumber: {
          indexAttemptId: input.indexAttemptId,
          segmentNumber: input.segmentNumber,
        },
      },
      data: { status: 'FAILED', lastError: input.error },
    });
  }

  async fail(indexAttemptId: string, error: string): Promise<void> {
    await this.prisma.indexingAttempt.update({
      where: { indexAttemptId },
      data: { status: 'FAILED', lastError: error },
    });
  }

  async findReusableEmbeddings(
    identities: EmbeddingCacheIdentity[],
  ): Promise<CachedEmbedding[]> {
    if (identities.length === 0) return [];
    const records = await this.prisma.embeddingCacheEntry.findMany({
      where: {
        cacheKey: { in: identities.map((identity) => identity.cacheKey) },
      },
    });
    return records.map((record) => ({
      cacheKey: record.cacheKey,
      stableItemId: record.stableItemId,
      documentKind: record.documentKind,
      embeddingInputHash: record.embeddingInputHash,
      embeddingProvider: record.embeddingProvider,
      embeddingModel: record.embeddingModel,
      embeddingDimensions: record.embeddingDimensions,
      embeddingVersion: record.embeddingVersion,
      indexVersion: record.indexVersion,
      chunkingVersion: record.chunkingVersion,
      summaryVersion: record.summaryVersion,
      embedding: record.embedding as unknown as number[],
    }));
  }

  async saveEmbeddings(embeddings: CachedEmbedding[]): Promise<void> {
    if (embeddings.length === 0) return;
    await this.prisma.$transaction(
      embeddings.map((entry) =>
        this.prisma.embeddingCacheEntry.upsert({
          where: { cacheKey: entry.cacheKey },
          create: {
            ...entry,
            embedding: entry.embedding,
          },
          update: {
            embeddingProvider: entry.embeddingProvider,
            embeddingModel: entry.embeddingModel,
            embeddingDimensions: entry.embeddingDimensions,
            embedding: entry.embedding,
          },
        }),
      ),
    );
  }

  private toCheckpoint(
    record: Record<string, unknown>,
    additional?: {
      documentDrafts?: ReelEvidenceDocumentDraft[];
      mergedTranscriptHash?: string;
      mergeAlgorithmVersion?: string;
    },
  ): IndexJobCheckpoint {
    return {
      indexAttemptId: record['indexAttemptId'] as string,
      jobId: record['jobId'] as string,
      reelId: record['reelId'] as string,
      mediaAttemptId: record['mediaAttemptId'] as string,
      indexVersion: record['indexVersion'] as string,
      status: record['status'] as IndexJobCheckpoint['status'],
      stage: record['stage'] as IndexCheckpointStage,
      mergedTranscript:
        (record['mergedTranscript'] as string | null) ?? undefined,
      mergedTranscriptHash: additional?.mergedTranscriptHash,
      mergeAlgorithmVersion: additional?.mergeAlgorithmVersion,
      mergedSegments:
        (record['mergedSegments'] as TranscriptSegment[] | null) ?? undefined,
      extractedMetadata:
        (record['extractedMetadata'] as ExtractedReelMetadata | null) ??
        undefined,
      sections: (record['sections'] as TranscriptSection[] | null) ?? undefined,
      chunks: (record['chunks'] as IndexChunkCheckpoint[] | null) ?? undefined,
      documentDrafts: additional?.documentDrafts,
      lastError: (record['lastError'] as string | null) ?? undefined,
    };
  }

  private async loadAdditionalState(indexAttemptId: string): Promise<{
    documentDrafts?: ReelEvidenceDocumentDraft[];
    mergedTranscriptHash?: string;
    mergeAlgorithmVersion?: string;
  }> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        documentDrafts: unknown;
        mergedTranscriptHash: string | null;
        mergeAlgorithmVersion: string | null;
      }>
    >(Prisma.sql`
      SELECT "documentDrafts", "mergedTranscriptHash", "mergeAlgorithmVersion"
      FROM "IndexingAttempt"
      WHERE "indexAttemptId" = ${indexAttemptId}
      LIMIT 1
    `);
    const row = rows[0];
    return {
      documentDrafts:
        (row?.documentDrafts as ReelEvidenceDocumentDraft[] | null) ??
        undefined,
      mergedTranscriptHash: row?.mergedTranscriptHash ?? undefined,
      mergeAlgorithmVersion: row?.mergeAlgorithmVersion ?? undefined,
    };
  }

  private toAudioSegment(
    record: Record<string, unknown>,
  ): AudioSegmentCheckpoint {
    return {
      indexAttemptId: record['indexAttemptId'] as string,
      segmentNumber: record['segmentNumber'] as number,
      artifactKey: record['artifactKey'] as string,
      artifactChecksum: record['artifactChecksum'] as string,
      startMs: record['startMs'] as number,
      endMs: record['endMs'] as number,
      overlapBeforeMs: record['overlapBeforeMs'] as number,
      provider: (record['provider'] as string | null) ?? undefined,
      transcriptionModel:
        (record['transcriptionModel'] as string | null) ?? undefined,
      transcriptionVersion:
        (record['transcriptionVersion'] as string | null) ?? undefined,
      status: record['status'] as AudioSegmentCheckpoint['status'],
      attemptCount: record['attemptCount'] as number,
      transcriptText: (record['transcriptText'] as string | null) ?? undefined,
      transcriptSegments:
        (record['transcriptSegments'] as TranscriptSegment[] | null) ??
        undefined,
      lastError: (record['lastError'] as string | null) ?? undefined,
    };
  }
}
