import type { ExtractedReelMetadata } from '@common/ai/interfaces/reel-metadata-extraction.interface';
import type { TranscriptSegment } from '@common/ai/interfaces/transcription-result.interface';
import type { ReelChunkIndexInput } from '@common/content/interfaces/reel-chunk-index.interface';
import type { ReelIndexJob } from '@common/processing/interfaces/reel-index-job.interface';
import type {
  CachedEmbedding,
  EmbeddingCacheIdentity,
  ReelIndexDocument,
  ReelIndexDocumentKind,
} from '@common/processing/interfaces/reel-index-document.interface';
import type { TranscriptSection } from '@indexing/domain/entities/index-checkpoint.entity';
import type { IIndexingAiService } from '@indexing/domain/interfaces/ai-service.interface';
import type { IIndexCheckpointRepository } from '@indexing/domain/interfaces/index-checkpoint.repository.interface';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

interface TimedToken {
  value: string;
  start: number;
  end: number;
  sentenceEnd: boolean;
}

interface DocumentDraft extends EmbeddingCacheIdentity {
  id: string;
  reelId: string;
  kind: ReelIndexDocumentKind;
  ordinal: number;
  parentId?: string;
  text: string;
  startTime?: number;
  endTime?: number;
}

@Injectable()
export class BuildHierarchicalIndexUseCase {
  constructor(
    private readonly config: ConfigService,
    @Inject('IIndexingAiService') private readonly ai: IIndexingAiService,
    @Inject('IIndexCheckpointRepository')
    private readonly checkpoints: IIndexCheckpointRepository,
  ) {}

  async execute(input: {
    job: ReelIndexJob;
    metadata: ExtractedReelMetadata;
    sections: TranscriptSection[];
    transcript?: string;
    transcriptSegments?: TranscriptSegment[];
  }): Promise<{
    documents: ReelIndexDocument[];
    chunks: ReelChunkIndexInput[];
  }> {
    const drafts = this.buildDocumentDrafts(input);
    const cached = (
      await this.checkpoints.findReusableEmbeddings(drafts)
    ).filter((entry) => this.isValidCachedEmbedding(entry));
    const embeddings = new Map(cached.map((entry) => [entry.cacheKey, entry]));
    const missing = drafts.filter((draft) => !embeddings.has(draft.cacheKey));
    const batchSize = this.positiveInt(
      'INDEX_EMBEDDING_BATCH_SIZE',
      32,
      2,
      100,
    );

    for (let offset = 0; offset < missing.length; offset += batchSize) {
      const batch = missing.slice(offset, offset + batchSize);
      const result = await this.ai.generateEmbeddingBatch({
        items: batch.map((draft) => ({
          id: draft.id,
          text: draft.text,
          taskType: 'RETRIEVAL_DOCUMENT',
          title: draft.kind === 'REEL' ? input.metadata.title : undefined,
        })),
      });
      const byId = new Map(batch.map((draft) => [draft.id, draft]));
      const completed: CachedEmbedding[] = [];
      const invalidIds: string[] = [];
      for (const embedding of result.embeddings) {
        const draft = byId.get(embedding.id);
        if (!draft)
          throw new Error(`Unexpected batch embedding item ${embedding.id}`);
        const provider = embedding.provider || draft.embeddingProvider;
        const model = embedding.model.replace(/^models\//, '');
        const version = embedding.version || draft.embeddingVersion;
        if (
          !embedding.values.length ||
          embedding.values.some((value) => !Number.isFinite(value)) ||
          embedding.dimensions !== embedding.values.length ||
          embedding.dimensions !== draft.embeddingDimensions ||
          provider !== draft.embeddingProvider ||
          model !== draft.embeddingModel ||
          version !== draft.embeddingVersion
        ) {
          invalidIds.push(embedding.id);
          continue;
        }
        completed.push({
          ...this.identity(draft),
          embedding: embedding.values,
          embeddingProvider: provider,
          embeddingModel: model,
          embeddingDimensions: embedding.dimensions,
          embeddingVersion: version,
        });
      }
      await this.checkpoints.saveEmbeddings(completed);
      for (const entry of completed) embeddings.set(entry.cacheKey, entry);

      const returnedIds = new Set(result.embeddings.map((entry) => entry.id));
      const missingIds = batch
        .filter((draft) => !returnedIds.has(draft.id))
        .map((draft) => draft.id);
      if (result.errors.length || missingIds.length || invalidIds.length) {
        const failedIds = [
          ...result.errors.map((error) => error.id),
          ...missingIds,
          ...invalidIds,
        ];
        throw new Error(
          `Batch embedding failed for ${new Set(failedIds).size} items`,
        );
      }
    }

    const documents = drafts.map((draft): ReelIndexDocument => {
      const embedding = embeddings.get(draft.cacheKey);
      if (!embedding)
        throw new Error(`Missing cached embedding for ${draft.id}`);
      return {
        id: draft.id,
        reelId: draft.reelId,
        kind: draft.kind,
        ordinal: draft.ordinal,
        parentId: draft.parentId,
        text: draft.text,
        startTime: draft.startTime,
        endTime: draft.endTime,
        embedding: embedding.embedding,
        embeddingProvider: embedding.embeddingProvider,
        embeddingModel: embedding.embeddingModel,
        embeddingDimensions: embedding.embeddingDimensions,
        embeddingVersion: embedding.embeddingVersion,
        embeddingInputHash: draft.embeddingInputHash,
        indexVersion: draft.indexVersion,
        chunkingVersion: draft.chunkingVersion,
        summaryVersion: draft.summaryVersion,
      };
    });
    const chunks = documents
      .filter((document) => document.kind === 'CHUNK')
      .map(
        (document): ReelChunkIndexInput => ({
          chunkIndex: document.ordinal,
          text: document.text,
          startTime: document.startTime,
          endTime: document.endTime,
          embedding: document.embedding,
          embeddingModel: [
            document.embeddingProvider,
            document.embeddingModel,
            document.embeddingDimensions,
            document.embeddingVersion,
          ].join(':'),
        }),
      );
    return { documents, chunks };
  }

  buildDocumentDrafts(input: {
    job: ReelIndexJob;
    metadata: ExtractedReelMetadata;
    sections: TranscriptSection[];
    transcript?: string;
    transcriptSegments?: TranscriptSegment[];
  }): DocumentDraft[] {
    const drafts: Array<Omit<DocumentDraft, keyof EmbeddingCacheIdentity>> = [];
    const reelId = `reel:${input.job.reelId}`;
    drafts.push({
      id: reelId,
      reelId: input.job.reelId,
      kind: 'REEL',
      ordinal: 0,
      text: this.reelText(input.metadata, input.transcript),
    });

    if (input.job.sourceLengthClass === 'LONG') {
      for (const section of input.sections) {
        drafts.push({
          id: `reel:${input.job.reelId}:section:${section.index}`,
          reelId: input.job.reelId,
          kind: 'SECTION',
          ordinal: section.index,
          parentId: reelId,
          text: this.sectionText(section),
          startTime: section.startMs / 1000,
          endTime: section.endMs / 1000,
        });
      }
    }

    const chunks = this.buildChunks(
      input.transcriptSegments,
      input.sections,
      input.transcript,
      input.metadata,
    );
    chunks.forEach((chunk, ordinal) => {
      const section = input.sections.find(
        (candidate) =>
          chunk.startTime !== undefined &&
          chunk.startTime * 1000 >= candidate.startMs &&
          chunk.startTime * 1000 < candidate.endMs,
      );
      drafts.push({
        id: `reel:${input.job.reelId}:chunk:${ordinal}`,
        reelId: input.job.reelId,
        kind: 'CHUNK',
        ordinal,
        parentId:
          input.job.sourceLengthClass === 'LONG' && section
            ? `reel:${input.job.reelId}:section:${section.index}`
            : reelId,
        ...chunk,
      });
    });

    return drafts.map((draft) => this.versionedDraft(draft, input.job));
  }

  private buildChunks(
    transcriptSegments: TranscriptSegment[] | undefined,
    sections: TranscriptSection[],
    transcript: string | undefined,
    metadata: ExtractedReelMetadata,
  ): Array<{ text: string; startTime?: number; endTime?: number }> {
    if (!transcriptSegments?.length) {
      const fallback = [
        metadata.title,
        metadata.description,
        metadata.tags.join(' '),
        transcript,
      ]
        .filter((value): value is string => Boolean(value?.trim()))
        .join('\n');
      return fallback
        ? [{ text: this.limitTokens(fallback, this.maxTokens()) }]
        : [];
    }

    const boundaries = sections.length
      ? sections
      : [{ index: 0, startMs: 0, endMs: Number.MAX_SAFE_INTEGER, text: '' }];
    const output: Array<{ text: string; startTime: number; endTime: number }> =
      [];
    for (const section of boundaries) {
      const sectionSegments = transcriptSegments.filter(
        (segment) =>
          segment.start * 1000 >= section.startMs &&
          segment.start * 1000 < section.endMs,
      );
      output.push(...this.chunkSection(sectionSegments));
    }
    return output;
  }

  private chunkSection(
    segments: TranscriptSegment[],
  ): Array<{ text: string; startTime: number; endTime: number }> {
    const tokens = segments.flatMap((segment) =>
      this.tokensForSegment(segment),
    );
    if (!tokens.length) return [];
    const chunks: Array<{ text: string; startTime: number; endTime: number }> =
      [];
    const target = this.positiveInt(
      'INDEX_CHUNK_TARGET_TOKENS',
      240,
      20,
      2_000,
    );
    const maximum = this.maxTokens();
    const overlap = this.positiveInt(
      'INDEX_CHUNK_OVERLAP_TOKENS',
      40,
      0,
      maximum - 1,
    );
    const maxSeconds = this.positiveInt('INDEX_CHUNK_MAX_SECONDS', 45, 5, 600);
    let current: TimedToken[] = [];

    const flush = () => {
      if (!current.length) return;
      chunks.push({
        text: this.limitTokens(
          current.map((token) => token.value).join(' '),
          maximum,
        ),
        startTime: current[0].start,
        endTime: current[current.length - 1].end,
      });
      current = overlap > 0 ? current.slice(-overlap) : [];
    };

    for (const token of tokens) {
      const duration = current.length ? token.end - current[0].start : 0;
      if (
        current.length &&
        (current.length >= maximum || duration > maxSeconds)
      )
        flush();
      current.push(token);
      if (current.length >= target && token.sentenceEnd) flush();
    }
    if (current.length > overlap || chunks.length === 0) flush();
    const minimum = this.positiveInt('INDEX_CHUNK_MIN_TOKENS', 80, 1, maximum);
    if (chunks.length > 1) {
      const last = chunks[chunks.length - 1];
      const previous = chunks[chunks.length - 2];
      const lastTokens = last.text.split(/\s+/);
      const previousTokens = previous.text.split(/\s+/);
      const uniqueLast = lastTokens.slice(Math.min(overlap, lastTokens.length));
      if (
        lastTokens.length < minimum &&
        previousTokens.length + uniqueLast.length <= maximum
      ) {
        previous.text = [...previousTokens, ...uniqueLast].join(' ');
        previous.endTime = last.endTime;
        chunks.pop();
      }
    }
    return chunks;
  }

  private tokensForSegment(segment: TranscriptSegment): TimedToken[] {
    const values = segment.text.trim().split(/\s+/).filter(Boolean);
    const duration = Math.max(0, segment.end - segment.start);
    return values.map((value, index) => ({
      value,
      start: segment.start + (duration * index) / Math.max(values.length, 1),
      end:
        segment.start + (duration * (index + 1)) / Math.max(values.length, 1),
      sentenceEnd: /[.!?]["')\]]*$/.test(value),
    }));
  }

  private reelText(
    metadata: ExtractedReelMetadata,
    transcript?: string,
  ): string {
    return this.limitTokens(
      [
        metadata.title ? `Title: ${metadata.title}` : undefined,
        metadata.description ? `Summary: ${metadata.description}` : undefined,
        metadata.tags.length
          ? `Topics: ${metadata.tags.join(', ')}`
          : undefined,
        !metadata.description && transcript
          ? `Summary: ${transcript}`
          : undefined,
      ]
        .filter((value): value is string => Boolean(value))
        .join('\n'),
      this.maxTokens(),
    );
  }

  private sectionText(section: TranscriptSection): string {
    return this.limitTokens(section.summary || section.text, this.maxTokens());
  }

  private versionedDraft(
    draft: Omit<DocumentDraft, keyof EmbeddingCacheIdentity>,
    job: ReelIndexJob,
  ): DocumentDraft {
    const embeddingInputHash = createHash('sha256')
      .update(draft.text.normalize('NFKC').trim())
      .digest('hex');
    const identityWithoutKey = {
      stableItemId: draft.id,
      documentKind: draft.kind,
      embeddingInputHash,
      embeddingProvider:
        this.config.get<string>('INDEX_EMBEDDING_PROVIDER') || 'google',
      embeddingModel: (
        this.config.get<string>('INDEX_EMBEDDING_MODEL') ||
        this.config.get<string>('GEMINI_EMBEDDING_MODEL') ||
        'gemini-embedding-001'
      ).replace(/^models\//, ''),
      embeddingDimensions: this.positiveInt(
        'INDEX_EMBEDDING_DIMENSIONS',
        this.positiveInt('GEMINI_EMBEDDING_DIMENSIONS', 384, 1, 10_000),
        1,
        10_000,
      ),
      embeddingVersion:
        this.config.get<string>('INDEX_EMBEDDING_VERSION') ||
        this.config.get<string>('GEMINI_EMBEDDING_VERSION') ||
        '1',
      indexVersion: job.indexVersion,
      chunkingVersion:
        this.config.get<string>('INDEX_CHUNKING_VERSION') || 'reel-chunk-v2',
      summaryVersion:
        this.config.get<string>('INDEX_SUMMARY_VERSION') || 'reel-summary-v1',
    };
    const cacheKey = createHash('sha256')
      .update(JSON.stringify(identityWithoutKey))
      .digest('hex');
    return { ...draft, ...identityWithoutKey, cacheKey };
  }

  private identity(draft: DocumentDraft): EmbeddingCacheIdentity {
    return {
      cacheKey: draft.cacheKey,
      stableItemId: draft.stableItemId,
      documentKind: draft.documentKind,
      embeddingInputHash: draft.embeddingInputHash,
      embeddingProvider: draft.embeddingProvider,
      embeddingModel: draft.embeddingModel,
      embeddingDimensions: draft.embeddingDimensions,
      embeddingVersion: draft.embeddingVersion,
      indexVersion: draft.indexVersion,
      chunkingVersion: draft.chunkingVersion,
      summaryVersion: draft.summaryVersion,
    };
  }

  private limitTokens(text: string, maximum: number): string {
    return text
      .trim()
      .split(/\s+/)
      .slice(0, maximum)
      .join(' ')
      .slice(0, 20_000)
      .trim();
  }

  private isValidCachedEmbedding(entry: CachedEmbedding): boolean {
    return (
      Array.isArray(entry.embedding) &&
      entry.embedding.length > 0 &&
      entry.embedding.length === entry.embeddingDimensions &&
      entry.embedding.every((value) => Number.isFinite(value))
    );
  }

  private maxTokens(): number {
    return this.positiveInt('INDEX_CHUNK_MAX_TOKENS', 350, 20, 4_000);
  }

  private positiveInt(
    key: string,
    fallback: number,
    min: number,
    max: number,
  ): number {
    const parsed = Number(this.config.get<string>(key) ?? fallback);
    return Number.isInteger(parsed)
      ? Math.min(max, Math.max(min, parsed))
      : fallback;
  }
}
