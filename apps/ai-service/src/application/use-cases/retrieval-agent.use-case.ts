import type {
  IContentService,
  TranscriptMatch,
} from '@ai/domain/interfaces/content-service.interface';
import type { IEmbeddingService } from '@ai/domain/interfaces/embedding.service.interface';
import type {
  RagChatRouteDecision,
  RagRetrievalPlan,
} from '@ai/domain/interfaces/rag-chat-workflow.interface';
import type { IRerankerService } from '@ai/domain/interfaces/reranker.service.interface';
import type {
  IStructuredLlmService,
  StructuredLlmJsonSchema,
} from '@ai/domain/interfaces/structured-llm.service.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';

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

@Injectable()
export class RetrievalAgentUseCase {
  private readonly logger = new Logger(RetrievalAgentUseCase.name);

  constructor(
    @Inject('IStructuredLlmService')
    private readonly structuredLlmService: IStructuredLlmService,

    @Inject('IEmbeddingService')
    private readonly embeddingService: IEmbeddingService,

    @Inject('IContentService')
    private readonly contentService: IContentService,

    @Inject('IRerankerService')
    private readonly rerankerService: IRerankerService,
  ) {}

  async execute(input: {
    userId: string;
    conversationId: string;
    message: string;
    route: RagChatRouteDecision;
  }): Promise<{
    plan: RagRetrievalPlan;
    retrievedChunks: TranscriptMatch[];
    rerankedChunks: TranscriptMatch[];
  }> {
    const plan = await this.planRetrieval(input);

    if (plan.mode === 'NONE') {
      return {
        plan,
        retrievedChunks: [],
        rerankedChunks: [],
      };
    }

    const queries = this.getQueries(plan);
    const allCandidates: TranscriptMatch[] = [];

    for (const queryText of queries) {
      const queryEmbedding = await this.embeddingService.generateVector({
        text: queryText,
        taskType: 'RETRIEVAL_QUERY',
      });

      const retrievedChunks = await this.contentService.searchReelContext({
        queryVector: queryEmbedding.values,
        queryText,
        userId: input.userId,
        conversationId: input.conversationId,
        sharedOnly: true,
        limit: plan.searchLimit,
      });

      allCandidates.push(...retrievedChunks);
    }

    const retrievedChunks = this.dedupeByChunkId(allCandidates);

    const rerankedChunks = plan.shouldRerank
      ? await this.rerankerService.rerank({
          queryText: queries.join('\n'),
          candidates: retrievedChunks,
          limit: plan.rerankLimit,
        })
      : retrievedChunks.slice(0, plan.rerankLimit);

    return {
      plan,
      retrievedChunks,
      rerankedChunks,
    };
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
          userPrompt: this.buildUserPrompt(input.message),
          jsonSchema: this.getJsonSchema(),
          maxTokens: 450,
          temperature: 0.1,
        });

      return this.normalize(raw, input.message);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.warn(`[RetrievalAgent] fallback default plan: ${message}`);

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
3. Keep each query focused on reel/video/transcript search.
4. Rewrite only when the user message is conversational, ambiguous, or contains references.
5. Do not invent facts not present in the user message.
6. Retrieval is scoped to reels shared into the current conversation.
7. For complex questions, produce up to 3 focused queries.
8. For simple questions, produce 1 query.
`.trim();
  }

  private buildUserPrompt(message: string): string {
    return `
User message:
${message}
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
        queries: {
          type: 'array',
          items: { type: 'string' },
        },
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
    if (!Array.isArray(value)) {
      return [fallbackQuery];
    }

    const seen = new Set<string>();
    const queries: string[] = [];

    for (const item of value) {
      if (typeof item !== 'string') {
        continue;
      }

      const query = item.replace(/\s+/g, ' ').trim();

      if (!query || seen.has(query.toLowerCase())) {
        continue;
      }

      seen.add(query.toLowerCase());
      queries.push(query);

      if (queries.length >= 3) {
        break;
      }
    }

    return queries.length > 0 ? queries : [fallbackQuery];
  }

  private getQueries(plan: RagRetrievalPlan): string[] {
    if (plan.queries && plan.queries.length > 0) {
      return plan.queries;
    }

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
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return fallback;
    }

    return Math.min(Math.max(Math.floor(value), min), max);
  }
}
