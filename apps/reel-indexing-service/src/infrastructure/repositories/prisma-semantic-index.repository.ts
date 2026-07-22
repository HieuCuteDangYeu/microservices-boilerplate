import type {
  SemanticIndexSearchFilters,
  SemanticIndexSearchRequest,
  SemanticIndexSearchResult,
  SemanticReelDocument,
} from '@common/processing/interfaces/semantic-index.interface';
import { SEMANTIC_INDEX_EMBEDDING_DIMENSIONS } from '@common/processing/interfaces/semantic-index.interface';
import type {
  ISemanticIndexRepository,
  SemanticIndexCandidate,
} from '@indexing/domain/interfaces/semantic-index.repository.interface';
import { PrismaService } from '@indexing/infrastructure/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/reel-indexing-client';
import { randomUUID } from 'crypto';

type SemanticTable = 'ReelDocument' | 'ReelSection' | 'ReelChunk';

interface SearchRow {
  id: string;
  reelId: string;
  parentId: string | null;
  userId: string;
  text: string;
  tags: string[];
  startTime: number | null;
  endTime: number | null;
  sourceDurationMs: number;
  sourceOrientation: SemanticIndexSearchResult['sourceOrientation'];
  sourceLengthClass: SemanticIndexSearchResult['sourceLengthClass'];
  rrfScore: number;
  vectorDistance: number | null;
  vectorRank: bigint | null;
  keywordRank: bigint | null;
  metadataRank: bigint | null;
}

interface ReelDocumentRow {
  id: string;
  reelId: string;
  userId: string;
  title: string | null;
  description: string | null;
  text: string;
  tags: string[];
  sourceDurationMs: number;
  sourceOrientation: SemanticReelDocument['sourceOrientation'];
  sourceLengthClass: SemanticReelDocument['sourceLengthClass'];
  indexAttemptId: string;
  indexVersion: string;
  embeddingProvider: string;
  embeddingModel: string;
  embeddingDimensions: number;
  embeddingVersion: string;
  chunkingVersion: string;
  summaryVersion: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class PrismaSemanticIndexRepository implements ISemanticIndexRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async persistCandidate(input: SemanticIndexCandidate): Promise<void> {
    const reel = input.documents.filter((document) => document.kind === 'REEL');
    const sections = input.documents.filter(
      (document) => document.kind === 'SECTION',
    );
    const chunks = input.documents.filter(
      (document) => document.kind === 'CHUNK',
    );
    if (reel.length !== 1) {
      throw new Error('Semantic index requires exactly one Reel document');
    }
    input.documents.forEach((document) => this.validateDocument(document));

    await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.job.reelId}))`;
      await transaction.transcriptionSegment.deleteMany({
        where: { indexAttemptId: input.job.indexAttemptId },
      });
      await transaction.reelChunk.deleteMany({
        where: { indexAttemptId: input.job.indexAttemptId },
      });
      await transaction.reelSection.deleteMany({
        where: { indexAttemptId: input.job.indexAttemptId },
      });
      await transaction.reelDocument.deleteMany({
        where: { indexAttemptId: input.job.indexAttemptId },
      });

      await transaction.$executeRaw(
        this.insertDocuments('ReelDocument', reel, input),
      );
      if (sections.length) {
        await transaction.$executeRaw(
          this.insertDocuments('ReelSection', sections, input),
        );
      }
      if (chunks.length) {
        await transaction.$executeRaw(
          this.insertDocuments('ReelChunk', chunks, input),
        );
      }
      if (input.transcriptSegments?.length) {
        await transaction.transcriptionSegment.createMany({
          data: input.transcriptSegments.map((segment, ordinal) => ({
            id: randomUUID(),
            reelId: input.job.reelId,
            indexAttemptId: input.job.indexAttemptId,
            ordinal,
            startTime: segment.start,
            endTime: segment.end,
            text: segment.text,
          })),
        });
      }
    });
  }

  async activateCandidate(
    reelId: string,
    indexAttemptId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${reelId}))`;
      await transaction.reelChunk.updateMany({
        where: { reelId, isActive: true },
        data: { isActive: false },
      });
      await transaction.reelSection.updateMany({
        where: { reelId, isActive: true },
        data: { isActive: false },
      });
      await transaction.reelDocument.updateMany({
        where: { reelId, isActive: true },
        data: { isActive: false },
      });
      const activated = await transaction.reelDocument.updateMany({
        where: { reelId, indexAttemptId },
        data: { isActive: true },
      });
      if (activated.count !== 1) {
        throw new Error(`Semantic candidate ${indexAttemptId} is missing`);
      }
      await transaction.reelSection.updateMany({
        where: { reelId, indexAttemptId },
        data: { isActive: true },
      });
      await transaction.reelChunk.updateMany({
        where: { reelId, indexAttemptId },
        data: { isActive: true },
      });
      await transaction.reelChunk.deleteMany({
        where: { reelId, indexAttemptId: { not: indexAttemptId } },
      });
      await transaction.reelSection.deleteMany({
        where: { reelId, indexAttemptId: { not: indexAttemptId } },
      });
      await transaction.reelDocument.deleteMany({
        where: { reelId, indexAttemptId: { not: indexAttemptId } },
      });
      await transaction.transcriptionSegment.deleteMany({
        where: { reelId, indexAttemptId: { not: indexAttemptId } },
      });
      const completed = await transaction.indexingAttempt.updateMany({
        where: { reelId, indexAttemptId },
        data: { status: 'COMPLETED', lastError: null },
      });
      if (completed.count !== 1) {
        throw new Error(`Indexing attempt ${indexAttemptId} is missing`);
      }
    });
  }

  async discardCandidate(
    reelId: string,
    indexAttemptId: string,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.reelChunk.deleteMany({
        where: { reelId, indexAttemptId, isActive: false },
      }),
      this.prisma.reelSection.deleteMany({
        where: { reelId, indexAttemptId, isActive: false },
      }),
      this.prisma.reelDocument.deleteMany({
        where: { reelId, indexAttemptId, isActive: false },
      }),
      this.prisma.transcriptionSegment.deleteMany({
        where: { reelId, indexAttemptId },
      }),
    ]);
  }

  async searchReels(
    input: SemanticIndexSearchRequest,
  ): Promise<SemanticIndexSearchResult[]> {
    return await this.search('ReelDocument', input);
  }

  async searchSections(
    input: SemanticIndexSearchRequest,
  ): Promise<SemanticIndexSearchResult[]> {
    return await this.search('ReelSection', input);
  }

  async searchChunks(
    input: SemanticIndexSearchRequest,
  ): Promise<SemanticIndexSearchResult[]> {
    return await this.search('ReelChunk', input);
  }

  async getReelDocument(reelId: string): Promise<SemanticReelDocument | null> {
    const rows = await this.prisma.$queryRaw<ReelDocumentRow[]>(Prisma.sql`
      SELECT "id", "reelId", "userId", "title", "description", "text",
        "tags", "sourceDurationMs", "sourceOrientation", "sourceLengthClass",
        "indexAttemptId", "indexVersion", "embeddingProvider", "embeddingModel",
        "embeddingDimensions", "embeddingVersion", "chunkingVersion",
        "summaryVersion", "createdAt", "updatedAt"
      FROM "ReelDocument"
      WHERE "reelId" = ${reelId} AND "isActive" = true
      LIMIT 1
    `);
    const row = rows[0];
    if (!row) return null;
    return {
      ...row,
      title: row.title ?? undefined,
      description: row.description ?? undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async deleteReel(reelId: string): Promise<boolean> {
    return await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${reelId}))`;
      const deleted = await transaction.reelDocument.deleteMany({
        where: { reelId },
      });
      await transaction.reelSection.deleteMany({ where: { reelId } });
      await transaction.reelChunk.deleteMany({ where: { reelId } });
      await transaction.transcriptionSegment.deleteMany({ where: { reelId } });
      await transaction.embeddingCacheEntry.deleteMany({
        where: {
          OR: [
            { stableItemId: `reel:${reelId}` },
            { stableItemId: { startsWith: `reel:${reelId}:` } },
          ],
        },
      });
      await transaction.indexingAttempt.deleteMany({ where: { reelId } });
      return deleted.count > 0;
    });
  }

  private async search(
    target: SemanticTable,
    input: SemanticIndexSearchRequest,
  ): Promise<SemanticIndexSearchResult[]> {
    const normalized = this.normalizeSearch(input);
    const table = Prisma.raw(`"${target}"`);
    const where = this.filters(normalized.filters);
    const vector = normalized.queryEmbedding
      ? `[${normalized.queryEmbedding.join(',')}]`
      : null;
    const query = Prisma.sql`
      WITH vector_candidates AS (
        SELECT t."rowId",
          row_number() OVER (ORDER BY t."embedding" <=> ${vector}::vector) AS rank,
          t."embedding" <=> ${vector}::vector AS distance
        FROM ${table} t
        WHERE t."isActive" = true AND ${vector}::vector IS NOT NULL ${where}
        ORDER BY t."embedding" <=> ${vector}::vector
        LIMIT ${normalized.candidateLimit}
      ), keyword_candidates AS (
        SELECT t."rowId",
          row_number() OVER (
            ORDER BY ts_rank_cd(t."searchVector", websearch_to_tsquery('simple', ${normalized.queryText})) DESC,
              t."rowId"
          ) AS rank
        FROM ${table} t
        WHERE t."isActive" = true
          AND ${normalized.queryText} <> ''
          AND t."searchVector" @@ websearch_to_tsquery('simple', ${normalized.queryText})
          ${where}
        ORDER BY ts_rank_cd(t."searchVector", websearch_to_tsquery('simple', ${normalized.queryText})) DESC,
          t."rowId"
        LIMIT ${normalized.candidateLimit}
      ), metadata_candidates AS (
        SELECT t."rowId",
          row_number() OVER (
            ORDER BY cardinality(ARRAY(
              SELECT unnest(t."tags") INTERSECT SELECT unnest(${normalized.queryTags}::text[])
            )) DESC, t."rowId"
          ) AS rank
        FROM ${table} t
        WHERE t."isActive" = true
          AND cardinality(${normalized.queryTags}::text[]) > 0
          AND t."tags" && ${normalized.queryTags}::text[]
          ${where}
        ORDER BY cardinality(ARRAY(
          SELECT unnest(t."tags") INTERSECT SELECT unnest(${normalized.queryTags}::text[])
        )) DESC, t."rowId"
        LIMIT ${normalized.candidateLimit}
      ), candidates AS (
        SELECT "rowId" FROM vector_candidates
        UNION SELECT "rowId" FROM keyword_candidates
        UNION SELECT "rowId" FROM metadata_candidates
      )
      SELECT t."id", t."reelId", t."parentId", t."userId", t."text", t."tags",
        t."startTime", t."endTime", t."sourceDurationMs", t."sourceOrientation",
        t."sourceLengthClass", v.distance AS "vectorDistance", v.rank AS "vectorRank",
        k.rank AS "keywordRank", m.rank AS "metadataRank",
        (coalesce(1.0 / (60 + v.rank), 0) +
         coalesce(1.0 / (60 + k.rank), 0) +
         coalesce(1.0 / (60 + m.rank), 0))::double precision AS "rrfScore"
      FROM candidates c
      JOIN ${table} t ON t."rowId" = c."rowId"
      LEFT JOIN vector_candidates v ON v."rowId" = c."rowId"
      LEFT JOIN keyword_candidates k ON k."rowId" = c."rowId"
      LEFT JOIN metadata_candidates m ON m."rowId" = c."rowId"
      ORDER BY "rrfScore" DESC, t."id"
      LIMIT ${normalized.limit}
    `;

    const rows = await this.prisma.$transaction(async (transaction) => {
      await this.configureHnsw(transaction);
      return await transaction.$queryRaw<SearchRow[]>(query);
    });
    return rows.map((row) => ({
      ...row,
      parentId: row.parentId ?? undefined,
      startTime: row.startTime ?? undefined,
      endTime: row.endTime ?? undefined,
      vectorDistance: row.vectorDistance ?? undefined,
      vectorRank: row.vectorRank === null ? undefined : Number(row.vectorRank),
      keywordRank:
        row.keywordRank === null ? undefined : Number(row.keywordRank),
      metadataRank:
        row.metadataRank === null ? undefined : Number(row.metadataRank),
    }));
  }

  private normalizeSearch(input: SemanticIndexSearchRequest): {
    queryText: string;
    queryEmbedding?: number[];
    queryTags: string[];
    filters: SemanticIndexSearchFilters;
    limit: number;
    candidateLimit: number;
  } {
    const queryText = input.queryText?.trim() ?? '';
    const queryTags = this.cleanStrings(input.queryTags);
    if (input.queryEmbedding) {
      if (
        input.queryEmbedding.length !== SEMANTIC_INDEX_EMBEDDING_DIMENSIONS ||
        input.queryEmbedding.some((value) => !Number.isFinite(value))
      ) {
        throw new Error(
          `queryEmbedding must contain ${SEMANTIC_INDEX_EMBEDDING_DIMENSIONS} finite values`,
        );
      }
    }
    if (!queryText && !input.queryEmbedding && queryTags.length === 0) {
      throw new Error('Semantic search requires text, an embedding, or tags');
    }
    const limit = this.boundedInt(input.limit, 20, 1, 100);
    return {
      queryText,
      queryEmbedding: input.queryEmbedding,
      queryTags,
      filters: input.filters ?? {},
      limit,
      candidateLimit: Math.max(
        limit,
        this.boundedInt(input.candidateLimit, 100, 1, 1_000),
      ),
    };
  }

  private filters(filters: SemanticIndexSearchFilters): Prisma.Sql {
    const reelIds = this.cleanStrings(filters.reelIds);
    const userIds = this.cleanStrings(filters.userIds);
    const parentIds = this.cleanStrings(filters.parentIds);
    const tags = this.cleanStrings(filters.tags);
    const lengthClasses = (filters.sourceLengthClasses ?? []).filter(
      (value) => value === 'SHORT' || value === 'LONG',
    );
    return Prisma.sql`
      ${reelIds.length ? Prisma.sql`AND t."reelId" IN (${Prisma.join(reelIds)})` : Prisma.empty}
      ${userIds.length ? Prisma.sql`AND t."userId" IN (${Prisma.join(userIds)})` : Prisma.empty}
      ${parentIds.length ? Prisma.sql`AND t."parentId" IN (${Prisma.join(parentIds)})` : Prisma.empty}
      ${tags.length ? Prisma.sql`AND t."tags" && ${tags}::text[]` : Prisma.empty}
      ${lengthClasses.length ? Prisma.sql`AND t."sourceLengthClass" IN (${Prisma.join(lengthClasses)})` : Prisma.empty}
    `;
  }

  private async configureHnsw(transaction: Prisma.TransactionClient) {
    const efSearch = this.boundedInt(
      Number(this.config.get<string>('INDEX_HNSW_EF_SEARCH')),
      100,
      1,
      1_000,
    );
    const maxScanTuples = this.boundedInt(
      Number(this.config.get<string>('INDEX_HNSW_MAX_SCAN_TUPLES')),
      20_000,
      1,
      1_000_000,
    );
    const scanMemMultiplier = this.positiveNumber(
      this.config.get<string>('INDEX_HNSW_SCAN_MEM_MULTIPLIER'),
      1,
    );
    const configuredScan =
      this.config
        .get<string>('INDEX_HNSW_ITERATIVE_SCAN')
        ?.trim()
        .toLowerCase() ?? 'strict_order';
    const iterativeScan = ['off', 'strict_order', 'relaxed_order'].includes(
      configuredScan,
    )
      ? configuredScan
      : 'strict_order';
    await transaction.$executeRawUnsafe(
      `SET LOCAL hnsw.ef_search = ${efSearch}`,
    );
    await transaction.$executeRawUnsafe(
      `SET LOCAL hnsw.iterative_scan = '${iterativeScan}'`,
    );
    await transaction.$executeRawUnsafe(
      `SET LOCAL hnsw.max_scan_tuples = ${maxScanTuples}`,
    );
    await transaction.$executeRawUnsafe(
      `SET LOCAL hnsw.scan_mem_multiplier = ${scanMemMultiplier}`,
    );
  }

  private insertDocuments(
    table: SemanticTable,
    documents: SemanticIndexCandidate['documents'],
    input: SemanticIndexCandidate,
  ): Prisma.Sql {
    const title = input.metadata.title ?? input.job.title ?? null;
    const description =
      input.metadata.description ?? input.job.description ?? null;
    const tags = this.cleanStrings(input.metadata.tags);
    const rows = documents.map(
      (document) => Prisma.sql`(
      ${randomUUID()}, ${document.id}, ${document.reelId}, ${input.job.indexAttemptId}, false,
      ${input.job.userId}, ${document.parentId ?? null}, ${title}, ${description}, ${document.text},
      ${tags}::text[], ${document.startTime ?? null}, ${document.endTime ?? null},
      ${input.job.sourceDurationMs}, ${input.job.sourceOrientation}, ${input.job.sourceLengthClass},
      ${`[${document.embedding.join(',')}]`}::vector, ${document.embeddingProvider},
      ${document.embeddingModel}, ${document.embeddingDimensions}, ${document.embeddingVersion},
      ${document.embeddingInputHash}, ${document.indexVersion}, ${document.chunkingVersion},
      ${document.summaryVersion}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )`,
    );
    return Prisma.sql`
      INSERT INTO ${Prisma.raw(`"${table}"`)} (
        "rowId", "id", "reelId", "indexAttemptId", "isActive", "userId", "parentId",
        "title", "description", "text", "tags", "startTime", "endTime", "sourceDurationMs",
        "sourceOrientation", "sourceLengthClass", "embedding", "embeddingProvider",
        "embeddingModel", "embeddingDimensions", "embeddingVersion", "embeddingInputHash",
        "indexVersion", "chunkingVersion", "summaryVersion", "createdAt", "updatedAt"
      ) VALUES ${Prisma.join(rows)}
    `;
  }

  private validateDocument(
    document: SemanticIndexCandidate['documents'][number],
  ): void {
    if (
      document.embeddingDimensions !== SEMANTIC_INDEX_EMBEDDING_DIMENSIONS ||
      document.embedding.length !== SEMANTIC_INDEX_EMBEDDING_DIMENSIONS ||
      document.embedding.some((value) => !Number.isFinite(value))
    ) {
      throw new Error(
        `Document ${document.id} must use a ${SEMANTIC_INDEX_EMBEDDING_DIMENSIONS}-dimension embedding`,
      );
    }
  }

  private cleanStrings(values?: string[]): string[] {
    return Array.from(
      new Set((values ?? []).map((value) => value.trim()).filter(Boolean)),
    );
  }

  private boundedInt(
    value: number | undefined,
    fallback: number,
    minimum: number,
    maximum: number,
  ): number {
    return Number.isInteger(value) && value! >= minimum && value! <= maximum
      ? value!
      : fallback;
  }

  private positiveNumber(value: string | undefined, fallback: number): number {
    const parsed = Number(value ?? fallback);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
