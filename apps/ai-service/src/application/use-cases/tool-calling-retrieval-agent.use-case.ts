import type {
  IContentService,
  TranscriptMatch,
} from '@ai/domain/interfaces/content-service.interface';
import type {
  RagChatRouteDecision,
  RagRequiredEvidence,
  RagRetrievalMode,
  RagRetrievalPlan,
} from '@ai/domain/interfaces/rag-chat-workflow.interface';
import type { IRetrievalAgentPolicy } from '@ai/domain/interfaces/retrieval-agent-policy.interface';
import type { IRetrievalEngine } from '@ai/domain/interfaces/retrieval-engine.interface';
import type {
  IToolCallingLlmService,
  LlmToolCall,
  LlmToolDefinition,
  ToolCallingMessage,
} from '@ai/domain/interfaces/tool-calling-llm.service.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';

interface RetrievalToolResult {
  items: TranscriptMatch[];
  error?: string;
}

@Injectable()
export class ToolCallingRetrievalAgentUseCase {
  private readonly toolLogger = new Logger(ToolCallingRetrievalAgentUseCase.name);

  constructor(
    @Inject('IRetrievalEngine')
    private readonly retrievalEngine: IRetrievalEngine,
    @Inject('IContentService')
    private readonly contentService: IContentService,
    @Inject('IToolCallingLlmService')
    private readonly toolLlm: IToolCallingLlmService,
    @Inject('IRetrievalAgentPolicy')
    private readonly policy: IRetrievalAgentPolicy,
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
    const plan = await this.plan({
      message: input.message,
      route: input.route,
    });
    const retrievedChunks = await this.retrieve({
      userId: input.userId,
      conversationId: input.conversationId,
      route: input.route,
      plan,
    });
    const rerankedChunks = await this.rerank({ plan, retrievedChunks });
    return { plan, retrievedChunks, rerankedChunks };
  }

  async plan(input: {
    message: string;
    route: RagChatRouteDecision;
  }): Promise<RagRetrievalPlan> {
    return await this.retrievalEngine.plan(input);
  }

  async retrieve(input: {
    userId: string;
    conversationId: string;
    route: RagChatRouteDecision;
    plan: RagRetrievalPlan;
    accessibleReelIds?: string[];
  }): Promise<TranscriptMatch[]> {
    if (input.plan.mode === 'NONE' || !this.policy.enabled) {
      return await this.retrievalEngine.retrieve(input);
    }

    const accessibleReelIds =
      input.accessibleReelIds ??
      (await this.contentService.resolveReelContextAccess({
        userId: input.userId,
        conversationId: input.conversationId,
      }));
    if (accessibleReelIds.length === 0) return [];

    try {
      const messages: ToolCallingMessage[] = [
        {
          role: 'system',
          content: this.buildToolSystemPrompt(),
        },
        {
          role: 'user',
          content: this.buildToolUserPrompt(input.plan, input.route),
        },
      ];
      const accumulated = new Map<string, TranscriptMatch>();

      for (let step = 0; step < this.policy.maxSteps; step += 1) {
        const completion = await this.toolLlm.complete({
          model: this.policy.model,
          messages,
          tools: this.getTools(),
          toolChoice: step === 0 ? 'required' : 'auto',
          maxTokens: 500,
          temperature: 0.1,
          timeoutMs: this.policy.callTimeoutMs,
        });

        messages.push({
          role: 'assistant',
          content: completion.content ?? null,
          toolCalls: completion.toolCalls,
        });

        if (completion.toolCalls.length === 0) break;

        const calls = completion.toolCalls.slice(
          0,
          this.policy.maxParallelCalls,
        );
        for (const call of calls) {
          const result = await this.executeToolCall({
            call,
            input,
            accessibleReelIds,
          });
          for (const item of result.items) {
            const existing = accumulated.get(item.chunkId);
            if (!existing || (item.score ?? 0) > (existing.score ?? 0)) {
              accumulated.set(item.chunkId, item);
            }
          }
          messages.push({
            role: 'tool',
            toolCallId: call.id,
            name: call.name,
            content: this.serializeToolResult(result),
          });
        }

        this.toolLogger.debug(
          `[RetrievalToolAgent] step=${step + 1} calls=${calls.map((call) => call.name).join(',')} accumulated=${accumulated.size}`,
        );
      }

      if (accumulated.size > 0) {
        return [...accumulated.values()];
      }

      this.toolLogger.warn(
        '[RetrievalToolAgent] no tool evidence returned; falling back to deterministic retrieval plan',
      );
      return await this.retrievalEngine.retrieve({
        ...input,
        accessibleReelIds,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.toolLogger.warn(
        `[RetrievalToolAgent] tool loop failed; deterministic fallback used: ${message}`,
      );
      return await this.retrievalEngine.retrieve({
        ...input,
        accessibleReelIds,
      });
    }
  }

  async rerank(input: {
    plan: RagRetrievalPlan;
    retrievedChunks: TranscriptMatch[];
  }): Promise<TranscriptMatch[]> {
    return await this.retrievalEngine.rerank(input);
  }

  private async executeToolCall(input: {
    call: LlmToolCall;
    input: {
      userId: string;
      conversationId: string;
      route: RagChatRouteDecision;
      plan: RagRetrievalPlan;
    };
    accessibleReelIds: string[];
  }): Promise<RetrievalToolResult> {
    if (
      input.call.name !== 'search_reel_content' &&
      input.call.name !== 'get_reel_context'
    ) {
      return {
        items: [],
        error: `Unsupported retrieval tool: ${input.call.name}`,
      };
    }

    const reelIds =
      input.call.name === 'get_reel_context'
        ? this.resolveRequestedReelIds(
            input.call.arguments['reelId'],
            input.accessibleReelIds,
          )
        : input.accessibleReelIds;
    if (reelIds.length === 0) {
      return {
        items: [],
        error: 'Requested reel is outside the conversation access scope.',
      };
    }

    const query =
      this.readString(input.call.arguments['query']) ||
      input.input.plan.rewrittenQuery?.trim() ||
      input.input.plan.query;
    const requestedMode = input.call.arguments['mode'];
    const mode: Exclude<RagRetrievalMode, 'NONE'> =
      requestedMode === 'REEL_VECTOR' || requestedMode === 'REEL_HYBRID'
        ? requestedMode
        : input.input.plan.mode === 'REEL_VECTOR'
          ? 'REEL_VECTOR'
          : 'REEL_HYBRID';
    const route = this.constrainEvidence(
      input.input.route,
      input.call.arguments['evidence'],
    );
    const limit = this.readLimit(
      input.call.arguments['limit'],
      input.input.plan.searchLimit,
    );
    const plan: RagRetrievalPlan = {
      ...input.input.plan,
      mode,
      query,
      rewrittenQuery: undefined,
      queries: [query],
      searchLimit: limit,
    };

    const items = await this.retrievalEngine.retrieve({
      userId: input.input.userId,
      conversationId: input.input.conversationId,
      route,
      plan,
      accessibleReelIds: reelIds,
    });

    return { items };
  }

  private getTools(): LlmToolDefinition[] {
    const evidenceItems = {
      type: 'string',
      enum: ['TRANSCRIPT', 'VISUAL', 'AUDIO', 'METADATA'],
    };
    return [
      {
        name: 'search_reel_content',
        description:
          'Search the reels available in this conversation. The backend performs access checks, hierarchical reel/section/chunk retrieval, hybrid search, neighbour expansion and later reranking. Use this first for normal reel questions.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          required: ['query'],
          properties: {
            query: {
              type: 'string',
              description: 'Focused retrieval query grounded in the user request.',
            },
            mode: {
              type: 'string',
              enum: ['REEL_VECTOR', 'REEL_HYBRID'],
            },
            evidence: {
              type: 'array',
              items: evidenceItems,
              description:
                'Optional evidence subset. It cannot widen the router-approved evidence types.',
            },
            limit: { type: 'number', minimum: 1, maximum: 20 },
          },
        },
      },
      {
        name: 'get_reel_context',
        description:
          'Search more deeply inside one reel returned by an earlier search. Use only when a specific reel needs focused transcript or visual context.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          required: ['reelId', 'query'],
          properties: {
            reelId: { type: 'string' },
            query: { type: 'string' },
            mode: {
              type: 'string',
              enum: ['REEL_VECTOR', 'REEL_HYBRID'],
            },
            evidence: {
              type: 'array',
              items: evidenceItems,
            },
            limit: { type: 'number', minimum: 1, maximum: 20 },
          },
        },
      },
    ];
  }

  private buildToolSystemPrompt(): string {
    return `
You are Velora's bounded retrieval specialist.

Your job is to choose and call retrieval tools, not to answer the user.

Rules:
1. The application already resolved which reels the user may access. Never invent or widen reel access.
2. Start with search_reel_content for ordinary questions.
3. Use get_reel_context only for a reel ID that appeared in a previous tool result.
4. The router-approved evidence types are hard constraints. Tool arguments may narrow them but never widen them.
5. Prefer one strong search over many broad searches. Call another tool only if the first result is insufficient or a specific reel requires deeper context.
6. Do not request SQL, embeddings, RRF, vector indexes or other implementation details; those remain deterministic backend responsibilities.
7. Once the tool results are sufficient, stop calling tools. Do not produce a user-facing answer.
`.trim();
  }

  private buildToolUserPrompt(
    plan: RagRetrievalPlan,
    route: RagChatRouteDecision,
  ): string {
    return JSON.stringify(
      {
        retrievalPlan: {
          query: plan.query,
          rewrittenQuery: plan.rewrittenQuery,
          queries: plan.queries,
          preferredMode: plan.mode,
          searchLimit: plan.searchLimit,
        },
        requiredEvidence: route.requiredEvidence,
        reelQuestionType: route.reelQuestionType,
      },
      null,
      2,
    );
  }

  private serializeToolResult(result: RetrievalToolResult): string {
    return JSON.stringify({
      ...(result.error ? { error: result.error } : {}),
      resultCount: result.items.length,
      results: result.items.slice(0, 10).map((item) => ({
        chunkId: item.chunkId,
        reelId: item.reelId,
        title: item.title,
        evidenceType: item.evidenceType,
        startTime: item.startTime,
        endTime: item.endTime,
        score: item.score,
        text: (item.evidenceText || item.chunkText || item.retrievalText || '')
          .slice(0, 700),
      })),
    });
  }

  private constrainEvidence(
    route: RagChatRouteDecision,
    requested: unknown,
  ): RagChatRouteDecision {
    if (!Array.isArray(requested)) return route;
    const allowed = new Set(route.requiredEvidence);
    const selected = requested.filter(
      (value): value is RagRequiredEvidence =>
        typeof value === 'string' &&
        allowed.has(value as RagRequiredEvidence) &&
        value !== 'NONE',
    );
    return selected.length > 0
      ? { ...route, requiredEvidence: [...new Set(selected)] }
      : route;
  }

  private resolveRequestedReelIds(
    value: unknown,
    accessibleReelIds: string[],
  ): string[] {
    const reelId = this.readString(value);
    return reelId && accessibleReelIds.includes(reelId) ? [reelId] : [];
  }

  private readString(value: unknown): string {
    return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  }

  private readLimit(value: unknown, fallback: number): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    const upper = Math.max(1, Math.min(20, fallback || 8));
    return Number.isFinite(parsed)
      ? Math.min(upper, Math.max(1, Math.floor(parsed)))
      : upper;
  }
}
