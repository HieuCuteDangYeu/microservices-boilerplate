import type { IAiApplicationConfig } from '@ai/domain/interfaces/ai-application-config.interface';
import type {
  RagChatIntent,
  RagChatRouteDecision,
  RagRecommendationAction,
  RagReferenceTarget,
  RagReelQuestionType,
  RagRouterReferentContext,
  RagRequiredEvidence,
} from '@ai/domain/interfaces/rag-chat-workflow.interface';
import type {
  IStructuredLlmService,
  StructuredLlmCallDiagnostics,
  StructuredLlmJsonSchema,
} from '@ai/domain/interfaces/structured-llm.service.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';

interface RawRouteDecision {
  intent?: unknown;
  referenceTarget?: unknown;
  reelQuestionType?: unknown;
  requiredEvidence?: unknown;
  recommendationAction?: unknown;
  reason?: unknown;
}

type RawRecord = Record<string, unknown>;

export class RouterUnavailableError extends Error {
  readonly code = 'ROUTER_UNAVAILABLE';

  constructor(
    readonly semanticCalls: StructuredLlmCallDiagnostics[] = [],
    readonly causeCode?: string,
  ) {
    super('Semantic router is temporarily unavailable');
    this.name = 'RouterUnavailableError';
  }
}

export class RouterSemanticInconsistencyError extends Error {
  readonly code = 'ROUTER_SEMANTIC_INCONSISTENT';

  constructor() {
    super('Semantic router returned an internally inconsistent referent');
    this.name = 'RouterSemanticInconsistencyError';
  }
}

@Injectable()
export class QueryRouterAgentUseCase {
  private readonly logger = new Logger(QueryRouterAgentUseCase.name);

  private readonly validIntents = new Set<RagChatIntent>([
    'NORMAL_CHAT',
    'REEL_VIDEO_QUESTION',
    'CONVERSATION_MEMORY_QUESTION',
    'USER_MEMORY_QUESTION',
    'TASK_ACTION_REQUEST',
  ]);

  private readonly validReferenceTargets = new Set<RagReferenceTarget>([
    'NONE',
    'SHARED_REEL',
    'CONVERSATION',
    'USER_MEMORY',
  ]);

  private readonly validReelQuestionTypes = new Set<RagReelQuestionType>([
    'NONE',
    'TRANSCRIPT_CONTENT',
    'VISUAL_CONTENT',
    'GENERAL_REEL_SUMMARY',
    'REEL_METADATA',
    'AMBIGUOUS_REEL_REFERENCE',
  ]);

  private readonly validRequiredEvidence = new Set<RagRequiredEvidence>([
    'NONE',
    'TRANSCRIPT',
    'VISUAL',
    'AUDIO',
    'METADATA',
    'CONVERSATION_MEMORY',
    'USER_MEMORY',
  ]);

  constructor(
    @Inject('IStructuredLlmService')
    private readonly structuredLlmService: IStructuredLlmService,
    @Inject('IAiApplicationConfig')
    private readonly config: IAiApplicationConfig,
  ) {}

  async execute(input: {
    message: string;
    recentHistory?: string;
    hasSharedReelContext?: boolean;
    sharedReelCount?: number;
    referentContext?: RagRouterReferentContext;
  }): Promise<RagChatRouteDecision> {
    if (!input.message.trim()) {
      return {
        ...this.createNormalChatRoute(
          'Empty or whitespace message treated as normal chat.',
        ),
        diagnostics: {
          modelRole: 'ROUTER',
          providerStatus: 'NOT_CALLED',
          decisionSource: 'STRUCTURAL',
        },
      };
    }

    const semanticCalls: StructuredLlmCallDiagnostics[] = [];
    const primaryModel = this.config.model('ROUTER');

    try {
      const result = this.normalize(
        await this.routeWithModel({
          input,
          model: primaryModel,
          attempt: 1,
          semanticCalls,
          timeoutMs: this.config.timeoutMs('ROUTER'),
        }),
        input,
      );

      if (this.needsReferentReconciliation(result, input)) {
        return await this.routeWithFallback({
          input,
          semanticCalls,
          primaryResult: result,
          reason: 'STRUCTURAL_REFERENT_AMBIGUITY',
        });
      }

      return {
        ...result,
        diagnostics: {
          modelRole: 'ROUTER',
          model: primaryModel,
          providerStatus: 'SUCCESS',
          decisionSource: 'LLM',
          semanticCalls,
        },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (!this.isFallbackEligible(error)) {
        this.logger.warn(
          `[QueryRouterAgent] semantic routing failed: ${message}`,
        );
        throw error;
      }

      return await this.routeWithFallback({
        input,
        semanticCalls,
        reason:
          error instanceof RouterSemanticInconsistencyError
            ? 'PRIMARY_SEMANTIC_INCONSISTENCY'
            : 'PRIMARY_PROVIDER_FAILURE',
      });
    }
  }

  private async routeWithFallback(input: {
    input: Parameters<QueryRouterAgentUseCase['execute']>[0];
    semanticCalls: StructuredLlmCallDiagnostics[];
    primaryResult?: RagChatRouteDecision;
    reason: string;
  }): Promise<RagChatRouteDecision> {
    const fallbackModel = this.config
      .get<string>('AI_ROUTER_FALLBACK_MODEL')
      ?.trim();
    if (!fallbackModel) {
      if (input.primaryResult) return input.primaryResult;
      throw new RouterUnavailableError(
        input.semanticCalls,
        input.reason === 'PRIMARY_SEMANTIC_INCONSISTENCY'
          ? 'ROUTER_SEMANTIC_INCONSISTENT'
          : input.semanticCalls.at(-1)?.errorCode,
      );
    }

    try {
      const result = this.normalize(
        await this.routeWithModel({
          input: input.input,
          model: fallbackModel,
          attempt: 2,
          maxTokens: Math.round(
            this.config.number(
              'AI_ROUTER_FALLBACK_MAX_TOKENS',
              this.config.maxCompletionTokens('ROUTER'),
              128,
              4096,
            ),
          ),
          semanticCalls: input.semanticCalls,
          timeoutMs: Math.round(
            this.config.number(
              'AI_ROUTER_FALLBACK_TIMEOUT_MS',
              30_000,
              500,
              120_000,
            ),
          ),
        }),
        input.input,
      );
      return {
        ...result,
        diagnostics: {
          modelRole: 'ROUTER',
          model: fallbackModel,
          providerStatus: 'SUCCESS',
          decisionSource: 'LLM_FALLBACK',
          semanticCalls: input.semanticCalls,
          fallbackReason: input.reason,
        },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[QueryRouterAgent] bounded semantic fallback failed: ${message}`,
      );
      throw new RouterUnavailableError(
        input.semanticCalls,
        this.errorCode(error),
      );
    }
  }

  private errorCode(error: unknown): string | undefined {
    if (!error || typeof error !== 'object' || !('code' in error)) {
      return undefined;
    }
    return typeof error.code === 'string' ? error.code : undefined;
  }

  private async routeWithModel(input: {
    input: {
      message: string;
      recentHistory?: string;
      hasSharedReelContext?: boolean;
      sharedReelCount?: number;
      referentContext?: RagRouterReferentContext;
    };
    model: string;
    attempt: number;
    maxTokens?: number;
    semanticCalls: StructuredLlmCallDiagnostics[];
    timeoutMs: number;
  }): Promise<RawRouteDecision> {
    return await this.structuredLlmService.generateObject<RawRouteDecision>({
      systemPrompt: this.buildSystemPrompt(),
      userPrompt: this.buildUserPrompt(input.input),
      jsonSchema: this.getJsonSchema(),
      maxTokens: input.maxTokens ?? this.config.maxCompletionTokens('ROUTER'),
      schemaVersion: 'router-semantic-v2',
      temperature: 0,
      model: input.model,
      modelRole: 'ROUTER',
      attempt: input.attempt,
      onDiagnostics: (diagnostics) => input.semanticCalls.push(diagnostics),
      timeoutMs: input.timeoutMs,
    });
  }

  private isFallbackEligible(error: unknown): boolean {
    if (!error || typeof error !== 'object' || !('code' in error)) return false;
    if (
      error.code === 'STRUCTURED_COMPLETION_PROVIDER_ERROR' &&
      'transient' in error &&
      error.transient === false
    ) {
      return false;
    }
    return (
      error.code === 'STRUCTURED_COMPLETION_TIMEOUT' ||
      error.code === 'STRUCTURED_COMPLETION_PROVIDER_ERROR' ||
      error.code === 'STRUCTURED_COMPLETION_SCHEMA_INVALID' ||
      error.code === 'ROUTER_SEMANTIC_INCONSISTENT'
    );
  }

  private buildSystemPrompt(): string {
    return `
You route Velora AI messages by meaning. Return only schema-valid JSON and never answer the user.
Output exactly these top-level fields and no others: intent, referenceTarget, reelQuestionType, requiredEvidence, recommendationAction, reason. recommendationAction contains exactly: type, query, allowPersonalizedFallback, suggestedQueries. The application derives retrieval/memory/verification flags and result-count policy; do not output those fields.

Intent meanings:
- NORMAL_CHAT: general conversation, coding help, app discussion, clarification, recommendation/discovery requests, or normal assistant chat.
- REEL_VIDEO_QUESTION: the user asks about a reel/video/clip/media item shared in the current conversation.
- CONVERSATION_MEMORY_QUESTION: the user asks what happened earlier in this conversation.
- USER_MEMORY_QUESTION: the user asks about stable facts, preferences, profile, or remembered user information.
- TASK_ACTION_REQUEST: the user asks to execute an external operation or change application/account state. This intent is a classification, not authorization to execute it. Read-only in-app content discovery and search suggestions are NORMAL_CHAT, never TASK_ACTION_REQUEST.

Reference target meanings:
- NONE: the current message does not semantically refer to shared media, conversation history, or user memory.
- SHARED_REEL: the meaning of the current message depends on reel/video/media shared in this conversation, including implicit factual follow-ups.
- CONVERSATION: the user asks about earlier turns or events in this conversation.
- USER_MEMORY: the user asks about stable remembered facts or preferences about the user.

Reel question type meanings:
- NONE: not a question about a shared reel/video.
- TRANSCRIPT_CONTENT: asks what the shared reel says, explains, discusses, mentions, captions, quotes, or teaches.
- VISUAL_CONTENT: asks about visual appearance, objects, people, colors, text on screen, layout, or what is seen.
- GENERAL_REEL_SUMMARY: asks for the shared reel's overall meaning, summary, topic, main point, or what it is about.
- REEL_METADATA: asks about title, description, caption, hashtags, tags, author, upload/share metadata.
- AMBIGUOUS_REEL_REFERENCE: refers to a shared reel/video but the requested information is unclear.

Evidence meanings:
- TRANSCRIPT: spoken words, transcript chunks, captions, or textual reel content are needed.
- VISUAL: visual frame analysis or OCR is needed.
- AUDIO: non-speech audio, music, tone, sound effects, or background audio is needed.
- METADATA: title, description, caption, tags, hashtags, author, or share metadata is needed.
- CONVERSATION_MEMORY: recent conversation/history summary is needed.
- USER_MEMORY: long-term user memory is needed.
- NONE: no special evidence is needed.

Recommendation action meanings:
- NONE: do not attach reel recommendations or query suggestions.
- RECOMMEND_REELS: user clearly asks to find, recommend, show, discover, or get reels/videos/content.
- SUGGEST_QUERIES: user asks what to search, search keywords, topic ideas, or query suggestions.

Invariants:
- A question about an available shared reel is REEL_VIDEO_QUESTION, not discovery.
- Summary needs TRANSCRIPT and METADATA; transcript, visual, and metadata questions require their matching evidence. Never substitute transcript for visual proof.
- Reel retrieval is required when grounded reel evidence is needed. Reel and memory answers require verification.
- Conversation memory is for prior conversation context; user memory is only for stable preferences/profile.
- RECOMMEND_REELS is only for explicit content discovery. Use a clean topic query; broad discovery may allow personalized fallback, topic-specific discovery may not.
- SUGGEST_QUERIES is only for requested search terms. Otherwise recommendationAction is NONE.
- Both discovery actions require intent=NORMAL_CHAT, referenceTarget=NONE, reelQuestionType=NONE, requiredEvidence=[NONE]. Internal search is not an external task. For NONE use query="", allowPersonalizedFallback=false and suggestedQueries=[]. For RECOMMEND_REELS use suggestedQueries=[]; for SUGGEST_QUERIES provide suggestions and allowPersonalizedFallback=false.
- Evidence is minimal for the classified question: TRANSCRIPT_CONTENT=[TRANSCRIPT], VISUAL_CONTENT=[VISUAL], REEL_METADATA=[METADATA], GENERAL_REEL_SUMMARY=[TRANSCRIPT,METADATA]. Non-reel routes use their own memory evidence or [NONE], never reel modalities.
- Do not invent context or use keyword/regex routing.
- Structural event metadata says what happened, not what the current message means. A recent reel share is evidence for resolving an implicit referent, but unrelated chat remains NORMAL_CHAT with referenceTarget=NONE.
- referenceTarget=SHARED_REEL requires intent=REEL_VIDEO_QUESTION. CONVERSATION requires CONVERSATION_MEMORY_QUESTION. USER_MEMORY requires USER_MEMORY_QUESTION. All other routes use NONE.
`.trim();
  }

  private buildUserPrompt(input: {
    message: string;
    recentHistory?: string;
    hasSharedReelContext?: boolean;
    sharedReelCount?: number;
    referentContext?: RagRouterReferentContext;
  }): string {
    return `
Current user message:
${input.message}

Shared reel context:
${input.hasSharedReelContext ? `AVAILABLE (${input.sharedReelCount ?? 0} accessible reel${input.sharedReelCount === 1 ? '' : 's'})` : 'NOT AVAILABLE'}

Structural referent context (contains no reel IDs and does not decide meaning):
${JSON.stringify(
  input.referentContext ?? {
    conversationHasSharedReelContext: input.hasSharedReelContext ?? false,
    accessibleSharedReelCount: input.sharedReelCount ?? 0,
    recentShareEvent: false,
    recentEventTypes: [],
  },
)}

Recent conversation context:
${input.recentHistory || '(empty)'}

Classify the current user message.
`.trim();
  }

  private getJsonSchema(): StructuredLlmJsonSchema {
    return {
      type: 'object',
      additionalProperties: false,
      required: [
        'intent',
        'referenceTarget',
        'reelQuestionType',
        'requiredEvidence',
        'recommendationAction',
        'reason',
      ],
      properties: {
        intent: {
          type: 'string',
          enum: [
            'NORMAL_CHAT',
            'REEL_VIDEO_QUESTION',
            'CONVERSATION_MEMORY_QUESTION',
            'USER_MEMORY_QUESTION',
            'TASK_ACTION_REQUEST',
          ],
        },
        referenceTarget: {
          type: 'string',
          enum: ['NONE', 'SHARED_REEL', 'CONVERSATION', 'USER_MEMORY'],
        },
        reelQuestionType: {
          type: 'string',
          enum: [
            'NONE',
            'TRANSCRIPT_CONTENT',
            'VISUAL_CONTENT',
            'GENERAL_REEL_SUMMARY',
            'REEL_METADATA',
            'AMBIGUOUS_REEL_REFERENCE',
          ],
        },
        requiredEvidence: {
          type: 'array',
          minItems: 1,
          maxItems: 4,
          items: {
            type: 'string',
            enum: [
              'NONE',
              'TRANSCRIPT',
              'VISUAL',
              'AUDIO',
              'METADATA',
              'CONVERSATION_MEMORY',
              'USER_MEMORY',
            ],
          },
        },
        recommendationAction: {
          type: 'object',
          additionalProperties: false,
          required: [
            'type',
            'query',
            'allowPersonalizedFallback',
            'suggestedQueries',
          ],
          properties: {
            type: {
              type: 'string',
              enum: ['NONE', 'RECOMMEND_REELS', 'SUGGEST_QUERIES'],
            },
            query: { type: 'string', maxLength: 240 },
            allowPersonalizedFallback: { type: 'boolean' },
            suggestedQueries: {
              type: 'array',
              maxItems: 5,
              items: { type: 'string', maxLength: 160 },
            },
          },
        },
        reason: { type: 'string', maxLength: 240 },
      },
    };
  }

  private normalize(
    raw: RawRouteDecision,
    input: { hasSharedReelContext?: boolean },
  ): RagChatRouteDecision {
    const intent = this.normalizeIntent(raw.intent);
    const referenceTarget = this.normalizeReferenceTarget(raw.referenceTarget);
    this.validateReferentConsistency(
      intent,
      referenceTarget,
      input.hasSharedReelContext ?? false,
    );
    const reelQuestionType = this.normalizeReelQuestionType(
      raw.reelQuestionType,
      intent,
    );

    const requiredEvidence = this.normalizeRequiredEvidence(
      raw.requiredEvidence,
      intent,
      reelQuestionType,
    );

    return {
      intent,
      referenceTarget,
      needsRetrieval: intent === 'REEL_VIDEO_QUESTION',
      needsUserMemory:
        intent === 'NORMAL_CHAT' || intent === 'USER_MEMORY_QUESTION',
      needsConversationSummary: [
        'NORMAL_CHAT',
        'CONVERSATION_MEMORY_QUESTION',
        'REEL_VIDEO_QUESTION',
      ].includes(intent),
      needsVerification: intent !== 'NORMAL_CHAT',
      reelQuestionType,
      requiredEvidence,
      recommendationAction: this.normalizeRecommendationAction(
        raw.recommendationAction,
        intent,
      ),
      reason:
        typeof raw.reason === 'string' && raw.reason.trim()
          ? raw.reason.trim()
          : 'No router reason provided.',
    };
  }

  private normalizeReferenceTarget(value: unknown): RagReferenceTarget {
    if (
      typeof value === 'string' &&
      this.validReferenceTargets.has(value as RagReferenceTarget)
    ) {
      return value as RagReferenceTarget;
    }
    throw new RouterSemanticInconsistencyError();
  }

  private validateReferentConsistency(
    intent: RagChatIntent,
    referenceTarget: RagReferenceTarget,
    hasSharedReelContext: boolean,
  ): void {
    const expected: Record<RagChatIntent, RagReferenceTarget> = {
      NORMAL_CHAT: 'NONE',
      REEL_VIDEO_QUESTION: 'SHARED_REEL',
      CONVERSATION_MEMORY_QUESTION: 'CONVERSATION',
      USER_MEMORY_QUESTION: 'USER_MEMORY',
      TASK_ACTION_REQUEST: 'NONE',
    };
    if (
      referenceTarget !== expected[intent] ||
      (referenceTarget === 'SHARED_REEL' && !hasSharedReelContext)
    ) {
      throw new RouterSemanticInconsistencyError();
    }
  }

  private needsReferentReconciliation(
    route: RagChatRouteDecision,
    input: { referentContext?: RagRouterReferentContext },
  ): boolean {
    return Boolean(
      input.referentContext?.recentShareEvent &&
      route.referenceTarget === 'NONE',
    );
  }

  private normalizeIntent(value: unknown): RagChatIntent {
    if (
      typeof value === 'string' &&
      this.validIntents.has(value as RagChatIntent)
    ) {
      return value as RagChatIntent;
    }

    throw new RouterSemanticInconsistencyError();
  }

  private normalizeReelQuestionType(
    value: unknown,
    intent: RagChatIntent,
  ): RagReelQuestionType {
    if (
      typeof value === 'string' &&
      this.validReelQuestionTypes.has(value as RagReelQuestionType)
    ) {
      if ((intent === 'REEL_VIDEO_QUESTION') === (value !== 'NONE'))
        return value as RagReelQuestionType;
    }

    throw new RouterSemanticInconsistencyError();
  }

  private normalizeRequiredEvidence(
    value: unknown,
    intent: RagChatIntent,
    reelQuestionType: RagReelQuestionType,
  ): RagRequiredEvidence[] {
    if (Array.isArray(value)) {
      const normalized = value.filter(
        (item): item is RagRequiredEvidence =>
          typeof item === 'string' &&
          this.validRequiredEvidence.has(item as RagRequiredEvidence),
      );

      if (
        normalized.length > 0 &&
        normalized.length === value.length &&
        new Set(normalized).size === normalized.length
      ) {
        const expected = this.defaultRequiredEvidence(intent, reelQuestionType);
        const ambiguous =
          intent === 'REEL_VIDEO_QUESTION' &&
          reelQuestionType === 'AMBIGUOUS_REEL_REFERENCE';
        if (
          ambiguous
            ? normalized.every((item) =>
                ['TRANSCRIPT', 'VISUAL', 'AUDIO', 'METADATA'].includes(item),
              )
            : normalized.length === expected.length &&
              expected.every((item) => normalized.includes(item))
        )
          return normalized;
      }
    }

    throw new RouterSemanticInconsistencyError();
  }

  private normalizeRecommendationAction(
    value: unknown,
    intent: RagChatIntent,
  ): RagRecommendationAction {
    const record = this.asRecord(value);

    if (!record) {
      throw new RouterSemanticInconsistencyError();
    }

    const type = record.type;
    if (
      !['NONE', 'RECOMMEND_REELS', 'SUGGEST_QUERIES'].includes(String(type)) ||
      (type !== 'NONE' && intent !== 'NORMAL_CHAT')
    )
      throw new RouterSemanticInconsistencyError();
    const query = this.normalizeOptionalString(record.query);
    const suggestions = this.normalizeSuggestedQueries(record.suggestedQueries);
    if (
      (type === 'NONE' &&
        (query ||
          record.allowPersonalizedFallback === true ||
          suggestions.length > 0)) ||
      (type === 'RECOMMEND_REELS' && suggestions.length > 0) ||
      (type === 'SUGGEST_QUERIES' &&
        (record.allowPersonalizedFallback === true || suggestions.length === 0))
    )
      throw new RouterSemanticInconsistencyError();

    if (type === 'RECOMMEND_REELS') {
      const query = this.normalizeOptionalString(record.query);
      const allowPersonalizedFallback =
        typeof record.allowPersonalizedFallback === 'boolean'
          ? record.allowPersonalizedFallback
          : !query;

      return {
        type: 'RECOMMEND_REELS',
        ...(query ? { query } : {}),
        minRelevantItems: 2,
        allowPersonalizedFallback,
        reason: this.normalizeReason(
          record.reason,
          'User asked for reel recommendations.',
        ),
      };
    }

    if (type === 'SUGGEST_QUERIES') {
      return {
        type: 'SUGGEST_QUERIES',
        ...(this.normalizeOptionalString(record.query)
          ? { query: this.normalizeOptionalString(record.query) }
          : {}),
        suggestedQueries: this.normalizeSuggestedQueries(
          record.suggestedQueries,
        ),
        reason: this.normalizeReason(
          record.reason,
          'User asked for query suggestions.',
        ),
      };
    }

    return {
      type: 'NONE',
      reason: this.normalizeReason(
        record.reason,
        'No recommendation action needed.',
      ),
    };
  }

  private defaultRequiredEvidence(
    intent: RagChatIntent,
    reelQuestionType: RagReelQuestionType,
  ): RagRequiredEvidence[] {
    if (intent === 'REEL_VIDEO_QUESTION') {
      if (reelQuestionType === 'GENERAL_REEL_SUMMARY') {
        return ['TRANSCRIPT', 'METADATA'];
      }

      if (reelQuestionType === 'TRANSCRIPT_CONTENT') {
        return ['TRANSCRIPT'];
      }

      if (reelQuestionType === 'REEL_METADATA') {
        return ['METADATA'];
      }

      if (reelQuestionType === 'VISUAL_CONTENT') {
        return ['VISUAL'];
      }

      return ['TRANSCRIPT', 'METADATA'];
    }

    if (intent === 'CONVERSATION_MEMORY_QUESTION') {
      return ['CONVERSATION_MEMORY'];
    }

    if (intent === 'USER_MEMORY_QUESTION') {
      return ['USER_MEMORY'];
    }

    return ['NONE'];
  }

  private normalizeSuggestedQueries(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const seen = new Set<string>();
    const suggestions: string[] = [];

    for (const item of value) {
      if (typeof item !== 'string') {
        continue;
      }

      const normalized = item.replace(/\s+/g, ' ').trim();

      if (!normalized || seen.has(normalized.toLowerCase())) {
        continue;
      }

      seen.add(normalized.toLowerCase());
      suggestions.push(normalized);

      if (suggestions.length >= 3) {
        break;
      }
    }

    return suggestions;
  }

  private normalizeOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.replace(/\s+/g, ' ').trim();

    return normalized.length > 0 ? normalized : undefined;
  }

  private normalizeReason(value: unknown, fallback: string): string {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    return fallback;
  }

  private asRecord(value: unknown): RawRecord | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    return value as RawRecord;
  }

  private createNormalChatRoute(reason: string): RagChatRouteDecision {
    return {
      intent: 'NORMAL_CHAT',
      referenceTarget: 'NONE',
      needsRetrieval: false,
      needsUserMemory: true,
      needsConversationSummary: true,
      needsVerification: false,
      reelQuestionType: 'NONE',
      requiredEvidence: ['NONE'],
      recommendationAction: {
        type: 'NONE',
        reason,
      },
      reason,
    };
  }
}
