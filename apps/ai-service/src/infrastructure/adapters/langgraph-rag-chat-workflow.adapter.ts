import { AnswerAgentUseCase } from '@ai/application/use-cases/answer-agent.use-case';
import { MemoryAgentUseCase } from '@ai/application/use-cases/memory-agent.use-case';
import { QueryRouterAgentUseCase } from '@ai/application/use-cases/query-router-agent.use-case';
import { RetrievalAgentUseCase } from '@ai/application/use-cases/retrieval-agent.use-case';
import { VerifierAgentUseCase } from '@ai/application/use-cases/verifier-agent.use-case';
import type {
  IRagChatWorkflow,
  RagChatWorkflowInput,
  RagChatWorkflowResult,
  RagChatWorkflowState,
} from '@ai/domain/interfaces/rag-chat-workflow.interface';
import { END, START, StateGraph, StateSchema } from '@langchain/langgraph';
import { Injectable, Logger } from '@nestjs/common';
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

  conversationMemory: z.any().optional(),
  userMemories: z.any().optional(),
  memorySelection: z.any().optional(),

  answer: z.string().optional(),
  verification: z.any().optional(),
  retryCount: z.number().default(0),
});

@Injectable()
export class LangGraphRagChatWorkflowAdapter implements IRagChatWorkflow {
  private readonly logger = new Logger(LangGraphRagChatWorkflowAdapter.name);

  constructor(
    private readonly queryRouterAgentUseCase: QueryRouterAgentUseCase,
    private readonly retrievalAgentUseCase: RetrievalAgentUseCase,
    private readonly memoryAgentUseCase: MemoryAgentUseCase,
    private readonly answerAgentUseCase: AnswerAgentUseCase,
    private readonly verifierAgentUseCase: VerifierAgentUseCase,
  ) {}

  async execute(input: RagChatWorkflowInput): Promise<RagChatWorkflowResult> {
    const graph = this.buildGraph();

    const initialState: RagChatWorkflowState = {
      userId: input.userId,
      conversationId: input.conversationId,
      userMessage: input.message,
      memory: input.memory,
      retrievedChunks: [],
      rerankedChunks: [],
      retryCount: 0,
    };

    const result = (await graph.invoke(initialState)) as RagChatWorkflowState;

    return {
      answer: result.answer?.trim() ?? '',
    };
  }

  private buildGraph() {
    return new StateGraph(RagChatStateSchema)
      .addNode('queryRouterNode', this.queryRouterNode)
      .addNode('retrievalNode', this.retrievalNode)
      .addNode('memorySelectorNode', this.memoryNode)
      .addNode('answerGenerationNode', this.answerNode)
      .addNode('verifierNode', this.verifierNode)
      .addNode('answerRevisionNode', this.answerRevisionNode)

      .addEdge(START, 'queryRouterNode')

      .addConditionalEdges('queryRouterNode', this.routeAfterQueryRouter, [
        'retrievalNode',
        'memorySelectorNode',
      ])

      .addEdge('retrievalNode', 'memorySelectorNode')
      .addEdge('memorySelectorNode', 'answerGenerationNode')

      .addConditionalEdges('answerGenerationNode', this.routeAfterAnswer, [
        'verifierNode',
        END,
      ])

      .addConditionalEdges('verifierNode', this.routeAfterVerifier, [
        'answerRevisionNode',
        END,
      ])

      .addEdge('answerRevisionNode', 'verifierNode')
      .compile();
  }

  private queryRouterNode = async (
    state: RagChatWorkflowState,
  ): Promise<Partial<RagChatWorkflowState>> => {
    const route = await this.timed('queryRouterNode', () =>
      this.queryRouterAgentUseCase.execute({
        message: state.userMessage,
        recentHistory: this.formatRecentHistory(state),
      }),
    );

    this.logger.debug(
      `[RagGraph] route intent=${route.intent} retrieval=${route.needsRetrieval}`,
    );

    return { route };
  };

  private retrievalNode = async (
    state: RagChatWorkflowState,
  ): Promise<Partial<RagChatWorkflowState>> => {
    const route = state.route;

    if (!route) {
      return {};
    }

    const result = await this.timed('retrievalNode', () =>
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

  private memoryNode = async (
    state: RagChatWorkflowState,
  ): Promise<Partial<RagChatWorkflowState>> => {
    const route = state.route;

    if (!route) {
      return {};
    }

    const result = await this.timed('memorySelectorNode', () =>
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

  private answerNode = async (
    state: RagChatWorkflowState,
  ): Promise<Partial<RagChatWorkflowState>> => {
    const answer = await this.timed('answerGenerationNode', () =>
      this.answerAgentUseCase.execute(state),
    );

    return { answer };
  };

  private verifierNode = async (
    state: RagChatWorkflowState,
  ): Promise<Partial<RagChatWorkflowState>> => {
    const verification = await this.timed('verifierNode', () =>
      this.verifierAgentUseCase.execute(state),
    );

    return { verification };
  };

  private answerRevisionNode = async (
    state: RagChatWorkflowState,
  ): Promise<Partial<RagChatWorkflowState>> => {
    const nextState: RagChatWorkflowState = {
      ...state,
      retryCount: state.retryCount + 1,
    };

    const answer = await this.timed('answerRevisionNode', () =>
      this.answerAgentUseCase.execute(nextState),
    );

    return {
      answer,
      retryCount: nextState.retryCount,
    };
  };

  private routeAfterQueryRouter = (
    state: RagChatWorkflowState,
  ): 'retrievalNode' | 'memorySelectorNode' => {
    return state.route?.needsRetrieval ? 'retrievalNode' : 'memorySelectorNode';
  };

  private routeAfterAnswer = (
    state: RagChatWorkflowState,
  ): 'verifierNode' | typeof END => {
    return state.route?.needsVerification ? 'verifierNode' : END;
  };

  private routeAfterVerifier = (
    state: RagChatWorkflowState,
  ): 'answerRevisionNode' | typeof END => {
    if (
      state.verification?.requiresRevision &&
      !state.verification.passed &&
      state.retryCount < 1
    ) {
      return 'answerRevisionNode';
    }

    return END;
  };

  private async timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const startedAt = Date.now();

    try {
      return await fn();
    } finally {
      this.logger.debug(
        `[RagGraphTiming] ${label}=${Date.now() - startedAt}ms`,
      );
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
