import type {
  IContentService,
  TranscriptMatch,
} from '@ai/domain/interfaces/content-service.interface';
import type { IEmbeddingService } from '@ai/domain/interfaces/embedding.service.interface';
import type {
  RagChatRouteDecision,
  RagRequiredEvidence,
  RagRetrievalMode,
  RagRetrievalPlan,
} from '@ai/domain/interfaces/rag-chat-workflow.interface';
import type { IRagHierarchyShadowObservationRepository } from '@ai/domain/interfaces/rag-hierarchy-shadow-observation.repository.interface';
import type { IRetrievalEngine } from '@ai/domain/interfaces/retrieval-engine.interface';
import type { IReelSemanticIndexService } from '@ai/domain/interfaces/reel-semantic-index.service.interface';
import type { IRerankerService } from '@ai/domain/interfaces/reranker.service.interface';
import type {
  IStructuredLlmService,
  StructuredLlmJsonSchema,
} from '@ai/domain/interfaces/structured-llm.service.interface';
import type {
  SemanticIndexSearchRequest,
  SemanticIndexSearchResult,
  SemanticReelDocument,
} from '@common/processing/interfaces/semantic-index.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface RawRetrievalPlan {
  mode?: unknown;
  query?: unknown;
  rewrittenQuery?: unknown;
  queries?: unknown;
  searchLimit?: unknown;
  rerankLimit?: unknown;
  shouldRerank?: unknown;
  reason?: unknown;
}

interface RetrievalExecutionInput {
  userId: string;
  conversationId: string;
  mode: Exclude<RagRetrievalMode, 'NONE'>;
  queryText: string;
  queryEmbedding: number[];
  accessibleReelIds: string[];
  limit: number;
  includeTranscript: boolean;
  includeVisual: boolean;
  requiredEvidence: RagRequiredEvidence[];
}

@Injectable()
export class DeterministicRetrievalEngineAdapter implements IRetrievalEngine {
  private readonly logger = new Logger(
    DeterministicRetrievalEngineAdapter.name,
  );
  private hasWarnedBlockedHierarchyPromotion = false;

  constructor(
    @Inject('IStructuredLlmService')
    private readonly structuredLlmService: IStructuredLlmService,
    @Inject('IEmbeddingService')
    private readonly embeddingService: IEmbeddingService,
    @Inject('IContentService')
    private readonly contentService: IContentService,
    @Inject('IReelSemanticIndexService')
    private readonly semanticIndexService: IReelSemanticIndexService,
    @Inject('IRerankerService')
    private readonly rerankerService: IRerankerService,
    @Inject('IRagHierarchyShadowObservationRepository')
    private readonly hierarchyObservationRepository: IRagHierarchyShadowObservationRepository,
    private readonly config: ConfigService,
  ) {}

  async plan(input: {
    message: string;
    route: RagChatRouteDecision;
  }): Promise<RagRetrievalPlan> {
    return await this.planRetrieval(input);
  }

  async retrieve(input: {
    userId: string;
    conversationId: string;
    route: RagChatRouteDecision;
    plan: RagRetrievalPlan;
    accessibleReelIds?: string[];
  }): Promise<TranscriptMatch[]> {
    if (input.plan.mode === 'NONE') {
      return [];
    }

    const queries = this.getQueries(input.plan);
    const allCandidates: TranscriptMatch[] = [];
    const accessibleReelIds =
      input.accessibleReelIds ??
      (await this.contentService.resolveReelContextAccess({
        userId: input.userId,
        conversationId: input.conversationId,
      }));
    if (accessibleReelIds.length === 0) {
      return [];
    }

    const includeVisual = input.route.requiredEvidence.includes('VISUAL');
    const includeTranscript =
      !includeVisual ||
      input.route.requiredEvidence.includes('TRANSCRIPT') ||
      input.route.requiredEvidence.includes('AUDIO');

    for (const queryText of queries) {
      const queryEmbedding = await this.embeddingService.generateVector({
        text: queryText,
        taskType: 'RETRIEVAL_QUERY',
      });
      allCandidates.push(
        ...(await this.retrieveForQuery({
          userId: input.userId,
          conversationId: input.conversationId,
          mode: input.plan.mode,
          queryText,
          queryEmbedding: queryEmbedding.values,
          accessibleReelIds,
          limit: input.plan.searchLimit,
          includeTranscript,
          includeVisual,
          requiredEvidence: input.route.requiredEvidence,
        })),
      );
    }

    return this.dedupeByChunkId(allCandidates);
  }

  async rerank(input: {
    plan: RagRetrievalPlan;
    retrievedChunks: TranscriptMatch[];
  }): Promise<TranscriptMatch[]> {
    if (input.plan.mode === 'NONE' || input.retrievedChunks.length === 0) {
      return [];
    }

    return input.plan.shouldRerank
      ? await this.rerankerService.rerank({
          queryText: this.getQueries(input.plan).join('\n'),
          candidates: input.retrievedChunks,
          limit: input.plan.rerankLimit,
        })
      : input.retrievedChunks.slice(0, input.plan.rerankLimit);
  }

  private async retrieveForQuery(
    input: RetrievalExecutionInput,
  ): Promise<TranscriptMatch[]> {
    const hierarchyRequested = this.readBoolean(
      'RAG_HIERARCHICAL_RETRIEVAL_ENABLED',
      false,
    );
    const hierarchicalEnabled =
      this.hierarchicalRetrievalEnabled(hierarchyRequested);
    const shadowEnabled =
      !hierarchicalEnabled &&
      (hierarchyRequested ||
        this.readBoolean('RAG_HIERARCHICAL_RETRIEVAL_SHADOW_ENABLED', true));

    if (hierarchicalEnabled) {
      return await this.retrieveHierarchically(input);
    }

    const startedAt = Date.now();
    const direct = await this.retrieveDirectly(input);
    const directMs = Date.now() - startedAt;

    if (shadowEnabled && input.includeTranscript) {
      const shadowStartedAt = Date.now();
      const hierarchical = await this.retrieveHierarchically(input);
      const hierarchicalMs = Date.now() - shadowStartedAt;
      await this.recordHierarchyShadowComparison({
        input,
        direct,
        hierarchical,
        directMs,
        hierarchicalMs,
      });
    }

    return direct;
  }

  private async retrieveHierarchically(
    input: RetrievalExecutionInput,
  ): Promise<TranscriptMatch[]> {
    const [transcriptCandidates, visualCandidates] = await Promise.all([
      input.includeTranscript
        ? this.retrieveTranscriptHierarchically(input)
        : Promise.resolve([] as SemanticIndexSearchResult[]),
      input.includeVisual
        ? this.retrieveVisualScenes(input)
        : Promise.resolve([] as SemanticIndexSearchResult[]),
    ]);
    return await this.hydrateAndExpand(
      [...transcriptCandidates, ...visualCandidates],
      input.accessibleReelIds,
    );
  }

  private async retrieveTranscriptHierarchically(
    input: RetrievalExecutionInput,
  ): Promise<SemanticIndexSearchResult[]> {
    const search = this.buildSearchRequest(input);
    const reelCandidates = await this.semanticIndexService.searchReels({
      ...search,
      filters: { reelIds: input.accessibleReelIds },
      limit: Math.min(Math.max(input.limit * 2, 8), 40),
    });
    if (reelCandidates.length === 0) return [];

    const longReelIds = reelCandidates
      .filter((candidate) => candidate.sourceLengthClass === 'LONG')
      .map((candidate) => candidate.reelId);
    const sectionCandidates =
      longReelIds.length > 0
        ? await this.semanticIndexService.searchSections({
            ...search,
            filters: {
              reelIds: longReelIds,
              sourceLengthClasses: ['LONG'],
            },
            limit: Math.min(Math.max(input.limit * 2, 8), 40),
          })
        : [];
    const parentIds = [
      ...reelCandidates
        .filter((candidate) => candidate.sourceLengthClass === 'SHORT')
        .map((candidate) => candidate.id),
      ...sectionCandidates.map((candidate) => candidate.id),
    ];
    if (parentIds.length === 0) return [];

    return await this.semanticIndexService.searchChunks({
      ...search,
      filters: {
        reelIds: reelCandidates.map((candidate) => candidate.reelId),
        parentIds,
      },
      limit: input.limit,
      candidateLimit: Math.min(Math.max(input.limit * 8, 50), 200),
    });
  }

  private async retrieveDirectly(
    input: RetrievalExecutionInput,
  ): Promise<TranscriptMatch[]> {
    const search = this.buildSearchRequest(input);
    const [chunks, visualScenes] = await Promise.all([
      input.includeTranscript
        ? this.semanticIndexService.searchChunks({
            ...search,
            filters: { reelIds: input.accessibleReelIds },
            limit: input.limit,
            candidateLimit: Math.min(Math.max(input.limit * 8, 50), 200),
          })
        : Promise.resolve([] as SemanticIndexSearchResult[]),
      input.includeVisual
        ? this.retrieveVisualScenes(input)
        : Promise.resolve([] as SemanticIndexSearchResult[]),
    ]);
    return await this.hydrateAndExpand(
      [...chunks, ...visualScenes],
      input.accessibleReelIds,
    );
  }

  private async retrieveVisualScenes(
    input: RetrievalExecutionInput,
  ): Promise<SemanticIndexSearchResult[]> {
    return await this.semanticIndexService.searchVisualScenes({
      ...this.buildSearchRequest(input),
      filters: { reelIds: input.accessibleReelIds },
      limit: input.limit,
      candidateLimit: Math.min(Math.max(input.limit * 8, 50), 200),
    });
  }

  private async hydrateAndExpand(
    candidates: SemanticIndexSearchResult[],
    accessibleReelIds: string[],
  ): Promise<TranscriptMatch[]> {
    const expanded = await this.expandNeighbours(candidates, accessibleReelIds);
    const documents = await Promise.all(
      [...new Set(expanded.map((candidate) => candidate.reelId))].map(
        async (reelId) =>
          [
            reelId,
            await this.semanticIndexService.getReelDocument(reelId),
          ] as const,
      ),
    );
    const documentByReelId = new Map<string, SemanticReelDocument | null>(
      documents,
    );
    return expanded.map((candidate) =>
      this.toTranscriptMatch(
        candidate,
        documentByReelId.get(candidate.reelId) ?? null,
      ),
    );
  }

  private buildSearchRequest(
    input: RetrievalExecutionInput,
  ): Pick<
    SemanticIndexSearchRequest,
    'queryText' | 'queryEmbedding' | 'queryTags'
  > {
    if (input.mode === 'REEL_VECTOR') {
      return { queryEmbedding: input.queryEmbedding };
    }
    return {
      queryText: input.queryText,
      queryEmbedding: input.queryEmbedding,
      queryTags: this.extractExplicitQueryTags(input.queryText),
    };
  }

  private extractExplicitQueryTags(queryText: string): string[] {
    const tags = queryText
      .split(/[^#\p{L}\p{N}_-]+/u)
      .filter((token) => /^#[\p{L}\p{N}_-]+$/u.test(token));
    return [...new Set(tags.map((tag) => tag.slice(1).toLowerCase()))].slice(
      0,
      8,
    );
  }

  private async expandNeighbours(
    chunks: SemanticIndexSearchResult[],
    eligibleReelIds: string[],
  ): Promise<SemanticIndexSearchResult[]> {
    const neighbours = await Promise.all(
      chunks.slice(0, 10).map(async (chunk) => {
        if (!chunk.parentId || chunk.evidenceType === 'VISUAL') return [];
        return await this.semanticIndexService.getAdjacentChunks({
          chunkId: chunk.id,
          reelId: chunk.reelId,
          parentId: chunk.parentId,
          eligibleReelIds,
          limit: 3,
        });
      }),
    );
    const byId = new Map<string, SemanticIndexSearchResult>();
    for (const chunk of [...chunks, ...neighbours.flat()]) {
      byId.set(chunk.id, chunk);
    }
    return [...byId.values()];
  }

  private hierarchicalRetrievalEnabled(requested: boolean): boolean {
    if (!requested) {
      return false;
    }

    const environment =
      this.config.get<string>('NODE_ENV')?.trim().toLowerCase() ?? '';
    if (environment !== 'production') {
      return true;
    }

    const promotionApproved = this.readBoolean(
      'RAG_HIERARCHICAL_RETRIEVAL_PROMOTION_APPROVED',
      false,
    );
    if (promotionApproved) {
      return true;
    }

    if (!this.hasWarnedBlockedHierarchyPromotion) {
      this.hasWarnedBlockedHierarchyPromotion = true;
      this.logger.warn(
        '[HierarchyRollout] production hierarchy serving was requested but promotion is not approved; serving direct retrieval and forcing hierarchy shadow instead',
      );
    }

    return false;
  }

  private readBoolean(name: string, fallback: boolean): boolean {
    const value = this.config.get<string>(name)?.trim().toLowerCase();
    if (value === 'true') return true;
    if (value === 'false') return false;
    return fallback;
  }

  private toTranscriptMatch(
    candidate: SemanticIndexSearchResult,
    document: SemanticReelDocument | null,
  ): TranscriptMatch {
    const vectorScore =
      candidate.vectorDistance === undefined
        ? 0
        : Math.min(Math.max(1 - candidate.vectorDistance, 0), 1);
    const keywordScore = candidate.keywordRank ? 1 / candidate.keywordRank : 0;
    const metadataScore = candidate.metadataRank
      ? 1 / candidate.metadataRank
      : 0;
    const hasVector = candidate.vectorRank !== undefined;
    const hasLexical =
      candidate.keywordRank !== undefined ||
      candidate.metadataRank !== undefined;
    const retrievalText = candidate.retrievalText || candidate.text;
    const evidenceText = candidate.evidenceText?.trim() || undefined;
    return {
      chunkId: candidate.id,
      reelId: candidate.reelId,
      title: document?.title,
      description: document?.description,
      tags: candidate.tags,
      chunkText: evidenceText ?? retrievalText,
      retrievalText,
      evidenceText,
      evidenceType: candidate.evidenceType,
      startTime: candidate.startTime,
      endTime: candidate.endTime,
      distance: candidate.vectorDistance ?? null,
      score: candidate.rrfScore,
      vectorScore,
      keywordScore,
      metadataScore,
      matchedBy:
        hasVector && hasLexical ? 'HYBRID' : hasVector ? 'VECTOR' : 'KEYWORD',
    };
  }

  private async recordHierarchyShadowComparison(input: {
    input: RetrievalExecutionInput;
    direct: TranscriptMatch[];
    hierarchical: TranscriptMatch[];
    directMs: number;
    hierarchicalMs: number;
  }): Promise<void> {
    const limit = Math.max(input.direct.length, input.hierarchical.length, 1);
    const directIds = input.direct.map((item) => item.chunkId);
    const hierarchicalIds = input.hierarchical.map((item) => item.chunkId);
    const directIdSet = new Set(directIds);
    const hierarchicalIdSet = new Set(hierarchicalIds);
    const intersection = [...directIdSet].filter((id) =>
      hierarchicalIdSet.has(id),
    );
    const union = new Set([...directIdSet, ...hierarchicalIdSet]);
    const overlapAtK = intersection.length / limit;
    const jaccard = union.size ? intersection.length / union.size : 1;

    this.logger.log(
      `[HierarchicalRetrievalShadow] ${JSON.stringify({
        query: input.input.queryText,
        directMs: input.directMs,
        hierarchicalMs: input.hierarchicalMs,
        direct: directIds.length,
        hierarchical: hierarchicalIds.length,
        overlapAtK: Number(overlapAtK.toFixed(4)),
        jaccard: Number(jaccard.toFixed(4)),
      })}`,
    );

    try {
      await this.hierarchyObservationRepository.save({
        userId: input.input.userId,
        conversationId: input.input.conversationId,
        queryText: input.input.queryText,
        retrievalMode: input.input.mode,
        requiredEvidence: input.input.requiredEvidence,
        directChunkIds: directIds,
        hierarchicalChunkIds: hierarchicalIds,
        directMs: input.directMs,
        hierarchicalMs: input.hierarchicalMs,
        overlapAtK,
        jaccard,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[HierarchyRollout] failed to persist shadow observation: ${message}`,
      );
    }
  }

  private async planRetrieval(input: {
    message: string;
    route: RagChatRouteDecision;
  }): Promise<RagRetrievalPlan> {
    if (!input.route.needsRetrieval) {
      return {
        mode: 'NONE',
        query: input.message,
        queries: [],
        searchLimit: 0,
        rerankLimit: 0,
        shouldRerank: false,
        reason: 'Router decided retrieval is not needed.',
      };
    }
    try {
      const raw =
        await this.structuredLlmService.generateObject<RawRetrievalPlan>({
          systemPrompt: this.buildSystemPrompt(),
          userPrompt: this.buildUserPrompt(input.message, input.route),
          jsonSchema: this.getJsonSchema(),
          maxTokens: 450,
          temperature: 0.1,
          timeoutMs: 4_000,
        });
      return this.normalize(raw, input.message);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`[RetrievalEngine] fallback default plan: ${message}`);
      return {
        mode: 'REEL_HYBRID',
        query: input.message,
        queries: [input.message],
        searchLimit: 8,
        rerankLimit: 5,
        shouldRerank: true,
        reason: 'Fallback retrieval plan.',
      };
    }
  }

  private buildSystemPrompt(): string {
    return `
You are a retrieval planning agent for reel/video RAG.

Decide the best retrieval queries and retrieval settings.

Rules:
1. Return only structured JSON matching the schema.
2. Do not answer the user.
3. Keep each query focused on the requested reel evidence.
4. Rewrite only when the user message is conversational, ambiguous, or contains references.
5. Do not invent facts not present in the user message.
6. Retrieval is scoped to reels shared into the current conversation.
7. For complex questions, produce up to 3 focused queries.
8. For simple questions, produce 1 query.
9. REEL_VECTOR means semantic vector search only. Use it when lexical wording is likely noisy or paraphrased.
10. REEL_HYBRID means semantic vector + full-text search, with explicit #hashtags also eligible for tag matching. Prefer it for normal factual reel questions.
11. The execution layer selects transcript and/or sampled visual-scene evidence from the router's required-evidence decision. Do not try to change that evidence policy.
`.trim();
  }

  private buildUserPrompt(
    message: string,
    route: RagChatRouteDecision,
  ): string {
    return `
User message:
${message}

Required evidence:
${route.requiredEvidence.join(', ')}
`.trim();
  }

  private getJsonSchema(): StructuredLlmJsonSchema {
    return {
      type: 'object',
      additionalProperties: false,
      required: [
        'mode',
        'query',
        'rewrittenQuery',
        'queries',
        'searchLimit',
        'rerankLimit',
        'shouldRerank',
        'reason',
      ],
      properties: {
        mode: {
          type: 'string',
          enum: ['NONE', 'REEL_VECTOR', 'REEL_HYBRID'],
        },
        query: { type: 'string' },
        rewrittenQuery: { type: 'string' },
        queries: { type: 'array', items: { type: 'string' } },
        searchLimit: { type: 'number' },
        rerankLimit: { type: 'number' },
        shouldRerank: { type: 'boolean' },
        reason: { type: 'string' },
      },
    };
  }

  private normalize(
    raw: RawRetrievalPlan,
    fallbackQuery: string,
  ): RagRetrievalPlan {
    const mode =
      raw.mode === 'REEL_VECTOR' || raw.mode === 'REEL_HYBRID'
        ? raw.mode
        : 'REEL_HYBRID';
    const query =
      typeof raw.query === 'string' && raw.query.trim()
        ? raw.query.trim()
        : fallbackQuery;
    const rewrittenQuery =
      typeof raw.rewrittenQuery === 'string' && raw.rewrittenQuery.trim()
        ? raw.rewrittenQuery.trim()
        : undefined;
    const queries = this.normalizeQueries(raw.queries, rewrittenQuery || query);
    return {
      mode,
      query,
      rewrittenQuery,
      queries,
      searchLimit: this.normalizeLimit(raw.searchLimit, 8, 1, 20),
      rerankLimit: this.normalizeLimit(raw.rerankLimit, 5, 1, 10),
      shouldRerank:
        typeof raw.shouldRerank === 'boolean' ? raw.shouldRerank : true,
      reason:
        typeof raw.reason === 'string' && raw.reason.trim()
          ? raw.reason.trim()
          : 'No retrieval reason provided.',
    };
  }

  private normalizeQueries(value: unknown, fallbackQuery: string): string[] {
    if (!Array.isArray(value)) return [fallbackQuery];
    const seen = new Set<string>();
    const queries: string[] = [];
    for (const item of value) {
      if (typeof item !== 'string') continue;
      const query = item.replace(/\s+/g, ' ').trim();
      if (!query || seen.has(query.toLowerCase())) continue;
      seen.add(query.toLowerCase());
      queries.push(query);
      if (queries.length >= 3) break;
    }
    return queries.length > 0 ? queries : [fallbackQuery];
  }

  private getQueries(plan: RagRetrievalPlan): string[] {
    if (plan.queries && plan.queries.length > 0) return plan.queries;
    return [plan.rewrittenQuery?.trim() || plan.query];
  }

  private dedupeByChunkId(chunks: TranscriptMatch[]): TranscriptMatch[] {
    const map = new Map<string, TranscriptMatch>();
    for (const chunk of chunks) {
      const existing = map.get(chunk.chunkId);
      if (!existing || (chunk.score ?? 0) > (existing.score ?? 0)) {
        map.set(chunk.chunkId, chunk);
      }
    }
    return [...map.values()];
  }

  private normalizeLimit(
    value: unknown,
    fallback: number,
    min: number,
    max: number,
  ): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.min(Math.max(Math.floor(value), min), max);
  }
}
