import { BuildRagCitationsUseCase } from '@ai/application/use-cases/build-rag-citations.use-case';
import { CheckContextSufficiencyUseCase } from '@ai/application/use-cases/check-context-sufficiency.use-case';
import { CreateNoContextAnswerUseCase } from '@ai/application/use-cases/create-no-context-answer.use-case';
import { MemoryAgentUseCase } from '@ai/application/use-cases/memory-agent.use-case';
import { QueryRouterAgentUseCase } from '@ai/application/use-cases/query-router-agent.use-case';
import { RetrievalAgentUseCase } from '@ai/application/use-cases/retrieval-agent.use-case';
import { SaveRagTraceUseCase } from '@ai/application/use-cases/save-rag-trace.use-case';
import { StreamFinalAnswerUseCase } from '@ai/application/use-cases/stream-final-answer.use-case';
import type { IContentService } from '@ai/domain/interfaces/content-service.interface';
import type {
  IRagChatWorkflow,
  RagChatWorkflowInput,
  RagChatWorkflowResult,
  RagChatWorkflowState,
} from '@ai/domain/interfaces/rag-chat-workflow.interface';
import { END, START, StateGraph, StateSchema } from '@langchain/langgraph';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod/v4';

const RagChatStateSchema = new StateSchema({
  userId: z.string(),
  conversationId: z.string(),
  userMessage: z.string(),
  memory: z.any().optional(),

  route: z.any().optional(),
  retrievalPlan: z.any().optional(),

  retrievedChunks: z.array(z.any()).default([]),
  rerankedChunks: z.array(z.any()).default([]),

  recommendedReels: z.array(z.any()).default([]),
  suggestedQueries: z.array(z.string()).default([]),

  contextSufficiency: z.any().optional(),

  conversationMemory: z.any().optional(),
  userMemories: z.any().optional(),
  memorySelection: z.any().optional(),

  answer: z.string().optional(),
  verification: z.any().optional(),
  citations: z.array(z.any()).default([]),

  retryCount: z.number().default(0),
  retrievalRetryCount: z.number().default(0),
});

@Injectable()
export class LangGraphRagChatWorkflowAdapter implements IRagChatWorkflow {
  private readonly logger = new Logger(LangGraphRagChatWorkflowAdapter.name);

  constructor(
    private readonly queryRouterAgentUseCase: QueryRouterAgentUseCase,
    private readonly retrievalAgentUseCase: RetrievalAgentUseCase,
    private readonly checkContextSufficiencyUseCase: CheckContextSufficiencyUseCase,
    private readonly memoryAgentUseCase: MemoryAgentUseCase,
    private readonly streamFinalAnswerUseCase: StreamFinalAnswerUseCase,
    private readonly createNoContextAnswerUseCase: CreateNoContextAnswerUseCase,
    private readonly buildRagCitationsUseCase: BuildRagCitationsUseCase,
    private readonly saveRagTraceUseCase: SaveRagTraceUseCase,

    @Inject('IContentService')
    private readonly contentService: IContentService,
  ) {}

  async execute(input: RagChatWorkflowInput): Promise<RagChatWorkflowResult> {
    const nodeTimings: Record<string, number> = {};
    const graph = this.buildGraph(nodeTimings);
    const startedAt = Date.now();

    const initialState: RagChatWorkflowState = {
      userId: input.userId,
      conversationId: input.conversationId,
      userMessage: input.message,
      memory: input.memory,
      retrievedChunks: [],
      rerankedChunks: [],
      recommendedReels: [],
      suggestedQueries: [],
      citations: [],
      retryCount: 0,
      retrievalRetryCount: 0,
    };

    let result: RagChatWorkflowState = initialState;

    try {
      result = await graph.invoke(initialState);

      return {
        answer: result.answer?.trim() ?? '',
        citations: result.citations ?? [],
        recommendedReels: result.recommendedReels ?? [],
        suggestedQueries: result.suggestedQueries ?? [],
      };
    } finally {
      await this.saveRagTraceUseCase.execute({
        state: result,
        latencyMs: Date.now() - startedAt,
        nodeTimings,
      });
    }
  }

  private buildGraph(nodeTimings: Record<string, number>) {
    return new StateGraph(RagChatStateSchema)
      .addNode('queryRouterNode', this.createQueryRouterNode(nodeTimings))
      .addNode('retrievalNode', this.createRetrievalNode(nodeTimings))
      .addNode(
        'contextSufficiencyNode',
        this.createContextSufficiencyNode(nodeTimings),
      )
      .addNode('memorySelectorNode', this.createMemoryNode(nodeTimings))
      .addNode('finalAnswerNode', this.createFinalAnswerNode(nodeTimings))
      .addNode(
        'noContextAnswerNode',
        this.createNoContextAnswerNode(nodeTimings),
      )
      .addNode(
        'reelRecommendationNode',
        this.createReelRecommendationNode(nodeTimings),
      )
      .addNode('citationNode', this.createCitationNode(nodeTimings))

      .addEdge(START, 'queryRouterNode')

      .addConditionalEdges('queryRouterNode', this.routeAfterQueryRouter, [
        'retrievalNode',
        'memorySelectorNode',
      ])

      .addEdge('retrievalNode', 'contextSufficiencyNode')

      .addConditionalEdges(
        'contextSufficiencyNode',
        this.routeAfterContextSufficiency,
        ['memorySelectorNode', 'noContextAnswerNode'],
      )

      .addEdge('memorySelectorNode', 'finalAnswerNode')
      .addEdge('finalAnswerNode', 'reelRecommendationNode')
      .addEdge('noContextAnswerNode', 'reelRecommendationNode')
      .addEdge('reelRecommendationNode', 'citationNode')
      .addEdge('citationNode', END)

      .compile();
  }

  private createQueryRouterNode(nodeTimings: Record<string, number>) {
    return async (
      state: RagChatWorkflowState,
    ): Promise<Partial<RagChatWorkflowState>> => {
      const route = await this.timed('queryRouterNode', nodeTimings, () =>
        this.queryRouterAgentUseCase.execute({
          message: state.userMessage,
          recentHistory: this.formatRecentHistory(state),
        }),
      );

      this.logger.debug(
        `[RagGraph] route intent=${route.intent} retrieval=${route.needsRetrieval} recommendation=${route.recommendationAction.type}`,
      );

      return { route };
    };
  }

  private createRetrievalNode(nodeTimings: Record<string, number>) {
    return async (
      state: RagChatWorkflowState,
    ): Promise<Partial<RagChatWorkflowState>> => {
      const route = state.route;

      if (!route) {
        return {};
      }

      const result = await this.timed('retrievalNode', nodeTimings, () =>
        this.retrievalAgentUseCase.execute({
          userId: state.userId,
          conversationId: state.conversationId,
          message: state.userMessage,
          route,
        }),
      );

      this.logger.log(
        `[RagGraph] retrieved=${result.retrievedChunks.length} reranked=${result.rerankedChunks.length}`,
      );

      return {
        retrievalPlan: result.plan,
        retrievedChunks: result.retrievedChunks,
        rerankedChunks: result.rerankedChunks,
      };
    };
  }

  private createContextSufficiencyNode(nodeTimings: Record<string, number>) {
    return async (
      state: RagChatWorkflowState,
    ): Promise<Partial<RagChatWorkflowState>> => {
      const contextSufficiency = await this.timed(
        'contextSufficiencyNode',
        nodeTimings,
        () => this.checkContextSufficiencyUseCase.execute(state),
      );

      this.logger.debug(
        `[RagGraph] context sufficient=${contextSufficiency.sufficient} action=${contextSufficiency.recommendedAction}`,
      );

      return { contextSufficiency };
    };
  }

  private createMemoryNode(nodeTimings: Record<string, number>) {
    return async (
      state: RagChatWorkflowState,
    ): Promise<Partial<RagChatWorkflowState>> => {
      const route = state.route;

      if (!route) {
        return {};
      }

      const result = await this.timed('memorySelectorNode', nodeTimings, () =>
        this.memoryAgentUseCase.execute({
          userId: state.userId,
          conversationId: state.conversationId,
          message: state.userMessage,
          route,
          memory: state.memory,
        }),
      );

      return {
        memorySelection: result.selection,
        conversationMemory: result.conversationMemory,
        userMemories: result.userMemories,
      };
    };
  }

  private createFinalAnswerNode(nodeTimings: Record<string, number>) {
    return async (
      state: RagChatWorkflowState,
    ): Promise<Partial<RagChatWorkflowState>> => {
      const answer = await this.timed('finalAnswerNode', nodeTimings, () =>
        this.streamFinalAnswerUseCase.execute(state),
      );

      return { answer };
    };
  }

  private createNoContextAnswerNode(nodeTimings: Record<string, number>) {
    return async (
      state: RagChatWorkflowState,
    ): Promise<Partial<RagChatWorkflowState>> => {
      const answer = await this.timed('noContextAnswerNode', nodeTimings, () =>
        Promise.resolve(this.createNoContextAnswerUseCase.execute(state)),
      );

      return { answer };
    };
  }

  private createReelRecommendationNode(nodeTimings: Record<string, number>) {
    return async (
      state: RagChatWorkflowState,
    ): Promise<Partial<RagChatWorkflowState>> => {
      const action = state.route?.recommendationAction;

      if (!action || action.type === 'NONE') {
        return {
          recommendedReels: [],
          suggestedQueries: [],
        };
      }

      if (action.type === 'SUGGEST_QUERIES') {
        return {
          recommendedReels: [],
          suggestedQueries: action.suggestedQueries ?? [],
        };
      }

      const query = action.query?.trim() || state.userMessage.trim();

      const recommendedReels = await this.timed(
        'reelRecommendationNode',
        nodeTimings,
        async () => {
          const searchResults = query
            ? await this.contentService.searchPublicReels({
                query,
                viewerId: state.userId,
                limit: 8,
              })
            : [];

          const uniqueSearchResults =
            this.dedupeRecommendedReels(searchResults);

          if (
            uniqueSearchResults.length >= action.minRelevantItems ||
            !action.allowPersonalizedFallback
          ) {
            return uniqueSearchResults.slice(0, 8);
          }

          const fallback = await this.contentService.getRecommendedReels({
            viewerId: state.userId,
            limit: 8,
          });

          return this.dedupeRecommendedReels([
            ...uniqueSearchResults,
            ...fallback,
          ]).slice(0, 8);
        },
      );

      return {
        recommendedReels,
        suggestedQueries: [],
      };
    };
  }

  private createCitationNode(nodeTimings: Record<string, number>) {
    return async (
      state: RagChatWorkflowState,
    ): Promise<Partial<RagChatWorkflowState>> => {
      const citations = await this.timed('citationNode', nodeTimings, () =>
        Promise.resolve(this.buildRagCitationsUseCase.execute(state)),
      );

      return { citations };
    };
  }

  private dedupeRecommendedReels(
    reels: NonNullable<RagChatWorkflowState['recommendedReels']>,
  ): NonNullable<RagChatWorkflowState['recommendedReels']> {
    const map = new Map<string, (typeof reels)[number]>();

    for (const reel of reels) {
      if (!reel?.id || map.has(reel.id)) {
        continue;
      }

      map.set(reel.id, reel);
    }

    return [...map.values()];
  }

  private routeAfterQueryRouter = (
    state: RagChatWorkflowState,
  ): 'retrievalNode' | 'memorySelectorNode' => {
    return state.route?.needsRetrieval ? 'retrievalNode' : 'memorySelectorNode';
  };

  private routeAfterContextSufficiency = (
    state: RagChatWorkflowState,
  ): 'memorySelectorNode' | 'noContextAnswerNode' => {
    if (!state.contextSufficiency) {
      return 'memorySelectorNode';
    }

    if (
      state.contextSufficiency.sufficient &&
      state.contextSufficiency.recommendedAction === 'ANSWER'
    ) {
      return 'memorySelectorNode';
    }

    return 'noContextAnswerNode';
  };

  private async timed<T>(
    label: string,
    nodeTimings: Record<string, number>,
    fn: () => Promise<T>,
  ): Promise<T> {
    const startedAt = Date.now();

    try {
      return await fn();
    } finally {
      const duration = Date.now() - startedAt;
      nodeTimings[label] = duration;

      this.logger.debug(`[RagGraphTiming] ${label}=${duration}ms`);
    }
  }

  private formatRecentHistory(state: RagChatWorkflowState): string {
    const messages = state.memory?.recentMessages ?? [];

    if (messages.length === 0) {
      return '';
    }

    return messages
      .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
      .join('\n');
  }
}
