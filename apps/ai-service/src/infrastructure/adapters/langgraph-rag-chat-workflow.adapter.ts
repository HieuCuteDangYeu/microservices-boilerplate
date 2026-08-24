import { BuildRagCitationsUseCase } from '@ai/application/use-cases/build-rag-citations.use-case';
import { BuildGroundedAnswerRevisionUseCase } from '@ai/application/use-cases/build-grounded-answer-revision.use-case';
import { CheckContextSufficiencyUseCase } from '@ai/application/use-cases/check-context-sufficiency.use-case';
import { CreateNoContextAnswerUseCase } from '@ai/application/use-cases/create-no-context-answer.use-case';
import { GenerateDraftAnswerUseCase } from '@ai/application/use-cases/generate-draft-answer.use-case';
import { MemoryAgentUseCase } from '@ai/application/use-cases/memory-agent.use-case';
import { PlanRetrievalUseCase } from '@ai/application/use-cases/plan-retrieval.use-case';
import { QueryRouterAgentUseCase } from '@ai/application/use-cases/query-router-agent.use-case';
import { RerankRetrievedEvidenceUseCase } from '@ai/application/use-cases/rerank-retrieved-evidence.use-case';
import { RetrieveReelEvidenceUseCase } from '@ai/application/use-cases/retrieve-reel-evidence.use-case';
import { RewriteRetrievalQueryUseCase } from '@ai/application/use-cases/rewrite-retrieval-query.use-case';
import { SaveRagTraceUseCase } from '@ai/application/use-cases/save-rag-trace.use-case';
import { StreamFinalAnswerUseCase } from '@ai/application/use-cases/stream-final-answer.use-case';
import { VerifierAgentUseCase } from '@ai/application/use-cases/verifier-agent.use-case';
import type { IContentService } from '@ai/domain/interfaces/content-service.interface';
import type {
  IRagChatWorkflow,
  RagChatWorkflowInput,
  RagChatWorkflowResult,
  RagChatWorkflowState,
} from '@ai/domain/interfaces/rag-chat-workflow.interface';
import { END, START, StateGraph, StateSchema } from '@langchain/langgraph';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod/v4';

const RagChatStateSchema = new StateSchema({
  userId: z.string(),
  conversationId: z.string(),
  userMessage: z.string(),
  memory: z.any().optional(),
  accessibleReelIds: z.array(z.string()).default([]),
  hasSharedReelContext: z.boolean().default(false),

  route: z.any().optional(),
  retrievalPlan: z.any().optional(),
  retrievalRepairQuery: z.string().optional(),

  retrievedChunks: z.array(z.any()).default([]),
  rerankedChunks: z.array(z.any()).default([]),
  retrievalReady: z.boolean().default(false),

  recommendedReels: z.array(z.any()).default([]),
  suggestedQueries: z.array(z.string()).default([]),

  contextSufficiency: z.any().optional(),

  conversationMemory: z.any().optional(),
  userMemories: z.any().optional(),
  memorySelection: z.any().optional(),
  memoryReady: z.boolean().default(false),

  answer: z.string().optional(),
  verification: z.any().optional(),
  citations: z.array(z.any()).default([]),
  citationCoverage: z.any().optional(),
  groundedRevision: z.any().optional(),
  draftHistory: z.array(z.any()).default([]),
  draftRevision: z.number().default(0),
  citationAttempts: z.array(z.any()).default([]),
  nextDraftSource: z.any().default('INITIAL'),
  finalFailureSource: z.any().default('UNKNOWN'),

  retryCount: z.number().default(0),
  retrievalRetryCount: z.number().default(0),
  citationRetryCount: z.number().default(0),
});

@Injectable()
export class LangGraphRagChatWorkflowAdapter implements IRagChatWorkflow {
  private readonly logger = new Logger(LangGraphRagChatWorkflowAdapter.name);

  constructor(
    private readonly queryRouterAgentUseCase: QueryRouterAgentUseCase,
    private readonly planRetrievalUseCase: PlanRetrievalUseCase,
    private readonly retrieveReelEvidenceUseCase: RetrieveReelEvidenceUseCase,
    private readonly rerankRetrievedEvidenceUseCase: RerankRetrievedEvidenceUseCase,
    private readonly rewriteRetrievalQueryUseCase: RewriteRetrievalQueryUseCase,
    private readonly checkContextSufficiencyUseCase: CheckContextSufficiencyUseCase,
    private readonly memoryAgentUseCase: MemoryAgentUseCase,
    private readonly generateDraftAnswerUseCase: GenerateDraftAnswerUseCase,
    private readonly verifierAgentUseCase: VerifierAgentUseCase,
    private readonly streamFinalAnswerUseCase: StreamFinalAnswerUseCase,
    private readonly createNoContextAnswerUseCase: CreateNoContextAnswerUseCase,
    private readonly buildRagCitationsUseCase: BuildRagCitationsUseCase,
    private readonly saveRagTraceUseCase: SaveRagTraceUseCase,
    private readonly config: ConfigService,

    @Inject('IContentService')
    private readonly contentService: IContentService,
    private readonly buildGroundedAnswerRevisionUseCase?: BuildGroundedAnswerRevisionUseCase,
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
      accessibleReelIds: [],
      hasSharedReelContext: false,
      retrievedChunks: [],
      rerankedChunks: [],
      retrievalReady: false,
      recommendedReels: [],
      suggestedQueries: [],
      memoryReady: false,
      citations: [],
      retryCount: 0,
      retrievalRetryCount: 0,
      citationRetryCount: 0,
      draftHistory: [],
      draftRevision: 0,
      citationAttempts: [],
      nextDraftSource: 'INITIAL',
      finalFailureSource: 'UNKNOWN',
    };

    let result: RagChatWorkflowState = initialState;

    try {
      result = await graph.invoke(initialState, { recursionLimit: 64 });

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
      .addNode(
        'resolveReelContextNode',
        this.createResolveReelContextNode(nodeTimings),
      )
      .addNode('queryRouterNode', this.createQueryRouterNode(nodeTimings))
      .addNode(
        'retrievalPlannerNode',
        this.createRetrievalPlannerNode(nodeTimings),
      )
      .addNode('retrievalNode', this.createRetrievalNode(nodeTimings))
      .addNode('neuralRerankerNode', this.createNeuralRerankerNode(nodeTimings))
      .addNode(
        'contextSufficiencyNode',
        this.createContextSufficiencyNode(nodeTimings),
      )
      .addNode(
        'retrievalRepairNode',
        this.createRetrievalRepairNode(nodeTimings),
      )
      .addNode('markRetrievalReadyNode', () => ({ retrievalReady: true }))
      .addNode('memorySelectorNode', this.createMemoryNode(nodeTimings))
      .addNode('answerContextJoinNode', () => ({}))
      .addNode('draftAnswerNode', this.createDraftAnswerNode(nodeTimings))
      .addNode('verifierNode', this.createVerifierNode(nodeTimings))
      .addNode(
        'prepareAnswerRevisionNode',
        this.createPrepareAnswerRevisionNode(),
      )
      .addNode('citationNode', this.createCitationNode(nodeTimings))
      .addNode(
        'citationCoverageGateNode',
        this.createCitationCoverageGateNode(nodeTimings),
      )
      .addNode(
        'prepareCitationRevisionNode',
        this.createPrepareCitationRevisionNode(),
      )
      .addNode('verificationFailureNode', this.createVerificationFailureNode())
      .addNode(
        'noContextAnswerNode',
        this.createNoContextAnswerNode(nodeTimings),
      )
      .addNode('finalAnswerNode', this.createFinalAnswerNode(nodeTimings))
      .addNode(
        'reelRecommendationNode',
        this.createReelRecommendationNode(nodeTimings),
      )

      .addEdge(START, 'resolveReelContextNode')
      .addEdge('resolveReelContextNode', 'queryRouterNode')
      .addConditionalEdges('queryRouterNode', this.routesAfterQueryRouter, [
        'retrievalPlannerNode',
        'memorySelectorNode',
        'reelRecommendationNode',
      ])
      .addEdge('retrievalPlannerNode', 'retrievalNode')
      .addEdge('retrievalNode', 'neuralRerankerNode')
      .addEdge('neuralRerankerNode', 'contextSufficiencyNode')
      .addConditionalEdges(
        'contextSufficiencyNode',
        this.routeAfterContextSufficiency,
        [
          'markRetrievalReadyNode',
          'retrievalRepairNode',
          'noContextAnswerNode',
        ],
      )
      .addEdge('retrievalRepairNode', 'retrievalPlannerNode')
      .addEdge('markRetrievalReadyNode', 'answerContextJoinNode')
      .addEdge('memorySelectorNode', 'answerContextJoinNode')
      .addConditionalEdges(
        'answerContextJoinNode',
        this.routeAfterContextJoin,
        ['draftAnswerNode', END],
      )
      .addEdge('draftAnswerNode', 'verifierNode')
      .addConditionalEdges('verifierNode', this.routeAfterVerifier, [
        'citationNode',
        'prepareAnswerRevisionNode',
        'verificationFailureNode',
      ])
      .addEdge('prepareAnswerRevisionNode', 'draftAnswerNode')
      .addEdge('citationNode', 'citationCoverageGateNode')
      .addConditionalEdges(
        'citationCoverageGateNode',
        this.routeAfterCitationCoverage,
        [
          'finalAnswerNode',
          'prepareCitationRevisionNode',
          'verificationFailureNode',
        ],
      )
      .addEdge('prepareCitationRevisionNode', 'draftAnswerNode')
      .addEdge('verificationFailureNode', 'finalAnswerNode')
      .addEdge('noContextAnswerNode', 'finalAnswerNode')
      .addEdge('finalAnswerNode', END)
      .addEdge('reelRecommendationNode', END)
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
          hasSharedReelContext: state.hasSharedReelContext,
          sharedReelCount: state.accessibleReelIds?.length ?? 0,
        }),
      );

      this.logger.debug(
        `[RagGraph] route intent=${route.intent} retrieval=${route.needsRetrieval} recommendation=${route.recommendationAction.type}`,
      );

      return { route };
    };
  }

  private createResolveReelContextNode(nodeTimings: Record<string, number>) {
    return async (
      state: RagChatWorkflowState,
    ): Promise<Partial<RagChatWorkflowState>> => {
      const accessibleReelIds = await this.timed(
        'resolveReelContextNode',
        nodeTimings,
        () =>
          this.contentService.resolveReelContextAccess({
            userId: state.userId,
            conversationId: state.conversationId,
          }),
      );

      return {
        accessibleReelIds,
        hasSharedReelContext: accessibleReelIds.length > 0,
      };
    };
  }

  private createRetrievalPlannerNode(nodeTimings: Record<string, number>) {
    return async (
      state: RagChatWorkflowState,
    ): Promise<Partial<RagChatWorkflowState>> => {
      if (!state.route) return {};
      const planningMessage =
        state.retrievalRepairQuery?.trim() || state.userMessage;
      const retrievalPlan = await this.timed(
        'retrievalPlannerNode',
        nodeTimings,
        () =>
          this.planRetrievalUseCase.execute({
            message: planningMessage,
            route: state.route!,
          }),
      );

      this.logger.debug(
        `[RagGraph] retrieval plan mode=${retrievalPlan.mode} queries=${retrievalPlan.queries?.length ?? 0} searchLimit=${retrievalPlan.searchLimit} rerankLimit=${retrievalPlan.rerankLimit}`,
      );
      return { retrievalPlan };
    };
  }

  private createRetrievalNode(nodeTimings: Record<string, number>) {
    return async (
      state: RagChatWorkflowState,
    ): Promise<Partial<RagChatWorkflowState>> => {
      if (!state.route || !state.retrievalPlan) return {};

      const retrievedChunks = await this.timed(
        'retrievalNode',
        nodeTimings,
        () =>
          this.retrieveReelEvidenceUseCase.execute({
            userId: state.userId,
            conversationId: state.conversationId,
            route: state.route!,
            plan: state.retrievalPlan!,
            accessibleReelIds: state.accessibleReelIds,
          }),
      );

      this.logger.log(
        `[RagGraph] retrieved=${retrievedChunks.length} retry=${state.retrievalRetryCount}`,
      );

      return {
        retrievedChunks,
        rerankedChunks: [],
      };
    };
  }

  private createNeuralRerankerNode(nodeTimings: Record<string, number>) {
    return async (
      state: RagChatWorkflowState,
    ): Promise<Partial<RagChatWorkflowState>> => {
      if (!state.retrievalPlan) return { rerankedChunks: [] };

      const rerankedChunks = await this.timed(
        'neuralRerankerNode',
        nodeTimings,
        () =>
          this.rerankRetrievedEvidenceUseCase.execute({
            plan: state.retrievalPlan!,
            retrievedChunks: state.retrievedChunks,
          }),
      );

      this.logger.log(`[RagGraph] reranked=${rerankedChunks.length}`);
      return { rerankedChunks };
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

  private createRetrievalRepairNode(nodeTimings: Record<string, number>) {
    return async (
      state: RagChatWorkflowState,
    ): Promise<Partial<RagChatWorkflowState>> => {
      const query = await this.timed('retrievalRepairNode', nodeTimings, () =>
        this.rewriteRetrievalQueryUseCase.execute(state),
      );

      this.logger.debug(
        `[RagGraph] retrieval repair retry=${state.retrievalRetryCount + 1} query=${JSON.stringify(query)}`,
      );

      return {
        retrievalRepairQuery: query,
        retrievalPlan: undefined,
        retrievalRetryCount: state.retrievalRetryCount + 1,
        retrievalReady: false,
        retrievedChunks: [],
        rerankedChunks: [],
      };
    };
  }

  private createMemoryNode(nodeTimings: Record<string, number>) {
    return async (
      state: RagChatWorkflowState,
    ): Promise<Partial<RagChatWorkflowState>> => {
      const route = state.route;

      if (!route) {
        return { memoryReady: true };
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
        memoryReady: true,
      };
    };
  }

  private createDraftAnswerNode(nodeTimings: Record<string, number>) {
    return async (
      state: RagChatWorkflowState,
    ): Promise<Partial<RagChatWorkflowState>> => {
      const groundedRevisionUseCase = this.buildGroundedAnswerRevisionUseCase;
      const groundedRevision = groundedRevisionUseCase
        ? await groundedRevisionUseCase.executeWithProvenance(state)
        : undefined;
      const groundedAnswer = groundedRevision?.answer;
      const draft = groundedAnswer
        ? undefined
        : await this.timed('draftAnswerNode', nodeTimings, () =>
            this.generateDraftAnswerUseCase.execute(state),
          );
      const answer = groundedAnswer ?? draft!.answer;

      return {
        answer,
        answerClaims: groundedRevision
          ? [
              {
                claim: groundedRevision.answer,
                evidenceIds: groundedRevision.evidenceIds,
              },
            ]
          : draft!.claims,
        answerDiagnostics: draft?.diagnostics,
        citations: [],
        citationCoverage: undefined,
        groundedRevision: groundedRevision
          ? {
              evidenceIds: groundedRevision.evidenceIds,
              modelRole: groundedRevision.modelRole,
            }
          : undefined,
        draftHistory: [
          ...state.draftHistory,
          {
            revision: state.draftRevision,
            source: groundedAnswer
              ? 'GROUNDED_VERIFIER_REVISION'
              : state.nextDraftSource,
            answer: answer.slice(0, 1500),
          },
        ].slice(-this.integer('AI_RAG_MAX_ANSWER_REVISIONS', 1, 0, 2) - 1),
        draftRevision: state.draftRevision + 1,
      };
    };
  }

  private createVerifierNode(nodeTimings: Record<string, number>) {
    return async (
      state: RagChatWorkflowState,
    ): Promise<Partial<RagChatWorkflowState>> => {
      const verification = await this.timed('verifierNode', nodeTimings, () =>
        this.verifierAgentUseCase.execute(state),
      );

      this.logger.debug(
        `[RagGraph] verification passed=${verification.passed} confidence=${verification.confidence.toFixed(2)} revision=${verification.requiresRevision}`,
      );

      return { verification };
    };
  }

  private createPrepareAnswerRevisionNode() {
    return (state: RagChatWorkflowState): Partial<RagChatWorkflowState> => ({
      retryCount: state.retryCount + 1,
      nextDraftSource: 'VERIFIER_REVISION',
      citations: [],
      citationCoverage: undefined,
    });
  }

  private createCitationNode(nodeTimings: Record<string, number>) {
    return async (
      state: RagChatWorkflowState,
    ): Promise<Partial<RagChatWorkflowState>> => {
      const assessment = await this.timed('citationNode', nodeTimings, () =>
        this.buildRagCitationsUseCase.execute(state),
      );

      return {
        citations: assessment.citations,
        citationCoverage: assessment.coverage,
        citationAttempts: [
          ...state.citationAttempts,
          {
            attempt: state.citationAttempts.length,
            decisionSource:
              assessment.coverage.diagnostics?.decisionSource ??
              assessment.coverage.mode,
            coverage: assessment.coverage.coverage,
            selectedEvidenceIds:
              assessment.coverage.diagnostics?.selectedEvidenceIds ?? [],
            deterministicSupportingEvidenceIds:
              assessment.coverage.diagnostics
                ?.deterministicSupportingEvidenceIds ?? [],
          },
        ].slice(-this.integer('AI_RAG_MAX_CITATION_REVISIONS', 1, 0, 2) - 1),
      };
    };
  }

  private createCitationCoverageGateNode(nodeTimings: Record<string, number>) {
    return async (
      state: RagChatWorkflowState,
    ): Promise<Partial<RagChatWorkflowState>> => {
      await this.timed('citationCoverageGateNode', nodeTimings, () => {
        const coverage = state.citationCoverage;
        this.logger.debug(
          `[RagGraph] citation coverage mode=${coverage?.mode ?? 'NONE'} coverage=${coverage?.coverage ?? 1} claims=${coverage?.supportedClaimCount ?? 0}/${coverage?.factualClaimCount ?? 0}`,
        );
        return Promise.resolve();
      });
      return {};
    };
  }

  private createPrepareCitationRevisionNode() {
    return (state: RagChatWorkflowState): Partial<RagChatWorkflowState> => {
      const unsupported = state.citationCoverage?.unsupportedClaims ?? [];
      const detail = unsupported.length
        ? ` Unsupported claims: ${unsupported.join(' | ')}`
        : '';

      return {
        citationRetryCount: state.citationRetryCount + 1,
        nextDraftSource: 'CITATION_REVISION',
        citations: [],
        citationCoverage: undefined,
        verification: {
          passed: false,
          confidence: state.citationCoverage?.coverage ?? 0,
          issues: ['Citation coverage is below the production threshold.'],
          requiresRevision: true,
          revisedInstruction: `Remove, qualify, or rewrite factual reel claims that are not directly supported by the supplied grounded evidence. Do not add new facts.${detail}`,
        },
      };
    };
  }

  private createVerificationFailureNode() {
    return (state: RagChatWorkflowState): Partial<RagChatWorkflowState> => ({
      answer:
        state.route?.intent === 'REEL_VIDEO_QUESTION'
          ? 'I do not have enough verified shared reel evidence to answer that reliably.'
          : 'I could not verify that answer reliably from the available context.',
      citations: [],
      citationCoverage: {
        mode: 'NOT_REQUIRED',
        coverage: 1,
        factualClaimCount: 0,
        supportedClaimCount: 0,
        unsupportedClaims: [],
      },
      finalFailureSource: state.citationCoverage ? 'CITATION' : 'VERIFIER',
    });
  }

  private createFinalAnswerNode(nodeTimings: Record<string, number>) {
    return async (
      state: RagChatWorkflowState,
    ): Promise<Partial<RagChatWorkflowState>> => {
      const answer = await this.timed('finalAnswerNode', nodeTimings, () =>
        this.streamFinalAnswerUseCase.execute(state),
      );

      return {
        answer,
        finalFailureSource:
          state.finalFailureSource === 'UNKNOWN'
            ? 'NONE'
            : state.finalFailureSource,
      };
    };
  }

  private createNoContextAnswerNode(nodeTimings: Record<string, number>) {
    return async (
      state: RagChatWorkflowState,
    ): Promise<Partial<RagChatWorkflowState>> => {
      const answer = await this.timed('noContextAnswerNode', nodeTimings, () =>
        Promise.resolve(this.createNoContextAnswerUseCase.execute(state)),
      );

      return {
        answer,
        citations: [],
        citationCoverage: {
          mode: 'NOT_REQUIRED',
          coverage: 1,
          factualClaimCount: 0,
          supportedClaimCount: 0,
          unsupportedClaims: [],
        },
        finalFailureSource: 'NO_CONTEXT',
      };
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

      try {
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
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `[RagGraph] recommendation branch failed open: ${message}`,
        );
        return { recommendedReels: [], suggestedQueries: [] };
      }
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

  private routesAfterQueryRouter = (
    state: RagChatWorkflowState,
  ): Array<
    'retrievalPlannerNode' | 'memorySelectorNode' | 'reelRecommendationNode'
  > => {
    const destinations: Array<
      'retrievalPlannerNode' | 'memorySelectorNode' | 'reelRecommendationNode'
    > = ['memorySelectorNode'];

    if (state.route?.needsRetrieval) {
      destinations.push('retrievalPlannerNode');
    }
    if (state.route?.recommendationAction.type !== 'NONE') {
      destinations.push('reelRecommendationNode');
    }

    return destinations;
  };

  private routeAfterContextSufficiency = (
    state: RagChatWorkflowState,
  ):
    | 'markRetrievalReadyNode'
    | 'retrievalRepairNode'
    | 'noContextAnswerNode' => {
    const context = state.contextSufficiency;
    if (!context) return 'markRetrievalReadyNode';

    if (context.sufficient && context.recommendedAction === 'ANSWER') {
      return 'markRetrievalReadyNode';
    }

    if (
      context.recommendedAction === 'REWRITE_AND_RETRY' &&
      state.retrievalRetryCount <
        this.integer('AI_RAG_MAX_RETRIEVAL_RETRIES', 1, 0, 2)
    ) {
      return 'retrievalRepairNode';
    }

    return 'noContextAnswerNode';
  };

  private routeAfterContextJoin = (
    state: RagChatWorkflowState,
  ): 'draftAnswerNode' | typeof END => {
    const memoryReady = state.memoryReady === true;
    const retrievalReady =
      !state.route?.needsRetrieval || state.retrievalReady === true;
    return memoryReady && retrievalReady ? 'draftAnswerNode' : END;
  };

  private routeAfterVerifier = (
    state: RagChatWorkflowState,
  ):
    | 'citationNode'
    | 'prepareAnswerRevisionNode'
    | 'verificationFailureNode' => {
    const minimumConfidence = this.number(
      'AI_RAG_VERIFIER_MIN_CONFIDENCE',
      0.65,
      0,
      1,
    );
    if (
      state.verification?.passed &&
      state.verification.confidence >= minimumConfidence
    ) {
      return 'citationNode';
    }

    if (
      state.verification?.requiresRevision &&
      state.retryCount < this.integer('AI_RAG_MAX_ANSWER_REVISIONS', 1, 0, 2)
    ) {
      return 'prepareAnswerRevisionNode';
    }

    return 'verificationFailureNode';
  };

  private routeAfterCitationCoverage = (
    state: RagChatWorkflowState,
  ):
    | 'finalAnswerNode'
    | 'prepareCitationRevisionNode'
    | 'verificationFailureNode' => {
    const coverage = state.citationCoverage;
    if (!coverage || coverage.mode === 'NOT_REQUIRED') {
      return 'finalAnswerNode';
    }

    if (coverage.mode === 'LLM' && coverage.factualClaimCount === 0)
      return 'finalAnswerNode';

    const threshold = this.number(
      'AI_RAG_CITATION_COVERAGE_THRESHOLD',
      1,
      0,
      1,
    );
    if (coverage.coverage >= threshold) return 'finalAnswerNode';

    if (
      state.citationRetryCount <
      this.integer('AI_RAG_MAX_CITATION_REVISIONS', 1, 0, 2)
    ) {
      return 'prepareCitationRevisionNode';
    }

    return 'verificationFailureNode';
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
      nodeTimings[label] = (nodeTimings[label] ?? 0) + duration;

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

  private number(
    key: string,
    fallback: number,
    min: number,
    max: number,
  ): number {
    const parsed = Number(this.config.get<string>(key) ?? fallback);
    return Number.isFinite(parsed)
      ? Math.min(max, Math.max(min, parsed))
      : fallback;
  }

  private integer(
    key: string,
    fallback: number,
    min: number,
    max: number,
  ): number {
    return Math.round(this.number(key, fallback, min, max));
  }
}
