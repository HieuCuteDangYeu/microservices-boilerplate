import type { IContentService } from '@ai/domain/interfaces/content.service.interface';
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
import type { ReelContextSearchResult } from '@common/content/interfaces/reel-context-search-result.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';

interface RawRetrievalPlan {
  mode?: unknown;
  query?: unknown;
  rewrittenQuery?: unknown;
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
    retrievedChunks: ReelContextSearchResult[];
    rerankedChunks: ReelContextSearchResult[];
  }> {
    const plan = await this.planRetrieval(input);

    if (plan.mode === 'NONE') {
      return {
        plan,
        retrievedChunks: [],
        rerankedChunks: [],
      };
    }

    const queryText = plan.rewrittenQuery?.trim() || plan.query;

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

    const rerankedChunks = plan.shouldRerank
      ? await this.rerankerService.rerank({
          queryText,
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
          maxTokens: 300,
          temperature: 0.1,
        });

      return this.normalize(raw, input.message);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`[RetrievalAgent] fallback default plan: ${message}`);

      return {
        mode: 'REEL_HYBRID',
        query: input.message,
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

Decide the best retrieval query and retrieval settings.

Rules:
1. Return only structured JSON matching the schema.
2. Do not answer the user.
3. Keep the query focused on reel/video/transcript search.
4. Rewrite only when the user message is conversational, ambiguous, or contains references.
5. Do not invent facts not present in the user message.
6. Retrieval is scoped to reels shared into the current conversation.
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

    return {
      mode,
      query:
        typeof raw.query === 'string' && raw.query.trim()
          ? raw.query.trim()
          : fallbackQuery,
      rewrittenQuery:
        typeof raw.rewrittenQuery === 'string'
          ? raw.rewrittenQuery.trim()
          : undefined,
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
