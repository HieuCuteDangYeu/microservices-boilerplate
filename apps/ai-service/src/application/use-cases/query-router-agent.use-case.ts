import type {
  RagChatIntent,
  RagChatRouteDecision,
  RagRecommendationAction,
  RagReelQuestionType,
  RagRequiredEvidence,
} from '@ai/domain/interfaces/rag-chat-workflow.interface';
import type {
  IStructuredLlmService,
  StructuredLlmJsonSchema,
} from '@ai/domain/interfaces/structured-llm.service.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';

interface RawRouteDecision {
  intent?: unknown;
  needsRetrieval?: unknown;
  needsUserMemory?: unknown;
  needsConversationSummary?: unknown;
  needsVerification?: unknown;
  reelQuestionType?: unknown;
  requiredEvidence?: unknown;
  recommendationAction?: unknown;
  reason?: unknown;
}

type RawRecord = Record<string, unknown>;

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
  ) {}

  async execute(input: {
    message: string;
    recentHistory?: string;
  }): Promise<RagChatRouteDecision> {
    if (!input.message.trim()) {
      return this.createNormalChatRoute(
        'Empty or whitespace message treated as normal chat.',
      );
    }

    try {
      const result =
        await this.structuredLlmService.generateObject<RawRouteDecision>({
          systemPrompt: this.buildSystemPrompt(),
          userPrompt: this.buildUserPrompt(input),
          jsonSchema: this.getJsonSchema(),
          maxTokens: 650,
          temperature: 0,
        });

      return this.normalize(result);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.warn(`[QueryRouterAgent] fallback NORMAL_CHAT: ${message}`);

      return this.createNormalChatRoute(
        'Fallback route because router failed.',
      );
    }
  }

  private buildSystemPrompt(): string {
    return `
You are the semantic query router for Velora AI, a RAG chatbot and reel discovery assistant.

Classify the current user message by meaning, not by keyword matching.

Return only JSON matching the schema. Do not answer the user.

Intent meanings:
- NORMAL_CHAT: general conversation, coding help, app discussion, clarification, recommendation/discovery requests, or normal assistant chat.
- REEL_VIDEO_QUESTION: the user asks about a reel/video/clip/media item shared in the current conversation.
- CONVERSATION_MEMORY_QUESTION: the user asks what happened earlier in this conversation.
- USER_MEMORY_QUESTION: the user asks about stable facts, preferences, profile, or remembered user information.
- TASK_ACTION_REQUEST: the user asks the system to perform an external action or tool operation.

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

Recommendation rules:
1. Use RECOMMEND_REELS only when the user clearly wants reel/video/content discovery.
2. Do not use RECOMMEND_REELS for normal chat.
3. Do not use RECOMMEND_REELS when the user only asks about a shared reel, such as "what is this reel about?" or "summarize this video".
4. Use SUGGEST_QUERIES only when the user asks for search terms, keywords, or what to search.
5. recommendationAction.query must be the clean searchable topic, not the full sentence.
6. If the user asks "recommend AI coding reels", query should be "AI coding".
7. If the user asks "find gym motivation videos", query should be "gym motivation".
8. If the user asks broad discovery like "recommend me some reels", query can be empty and allowPersonalizedFallback should be true.
9. If the user asks topic-specific discovery, allowPersonalizedFallback must be false so unrelated reels are not padded.
10. Never attach reel recommendations if they are unrelated to the user message.
11. If fewer than two relevant reels exist, returning fewer is better than padding unrelated reels.

Routing rules:
1. Do not answer the user.
2. Do not invent available context.
3. If the user asks about a shared reel/video/media item, use REEL_VIDEO_QUESTION.
4. If the user asks for a general summary of a shared reel/video/media item, use GENERAL_REEL_SUMMARY.
5. GENERAL_REEL_SUMMARY should require TRANSCRIPT and METADATA.
6. TRANSCRIPT_CONTENT should require TRANSCRIPT.
7. REEL_METADATA should require METADATA.
8. VISUAL_CONTENT should require VISUAL.
9. If the user asks what is visually shown, written on screen, or visible, do not treat transcript alone as enough.
10. Retrieval is needed for REEL_VIDEO_QUESTION when requiredEvidence includes TRANSCRIPT or METADATA.
11. Conversation summary is useful for follow-up references to earlier discussion.
12. User memory is useful only for stable user preferences or profile.
13. Verification is useful for reel/video and memory answers.
14. Recommendation decisions must be semantic and based on the user's intent.
`.trim();
  }

  private buildUserPrompt(input: {
    message: string;
    recentHistory?: string;
  }): string {
    return `
Current user message:
${input.message}

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
        'needsRetrieval',
        'needsUserMemory',
        'needsConversationSummary',
        'needsVerification',
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
        needsRetrieval: { type: 'boolean' },
        needsUserMemory: { type: 'boolean' },
        needsConversationSummary: { type: 'boolean' },
        needsVerification: { type: 'boolean' },
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
            'minRelevantItems',
            'allowPersonalizedFallback',
            'suggestedQueries',
            'reason',
          ],
          properties: {
            type: {
              type: 'string',
              enum: ['NONE', 'RECOMMEND_REELS', 'SUGGEST_QUERIES'],
            },
            query: { type: 'string' },
            minRelevantItems: { type: 'number' },
            allowPersonalizedFallback: { type: 'boolean' },
            suggestedQueries: {
              type: 'array',
              items: { type: 'string' },
            },
            reason: { type: 'string' },
          },
        },
        reason: { type: 'string' },
      },
    };
  }

  private normalize(raw: RawRouteDecision): RagChatRouteDecision {
    const intent = this.normalizeIntent(raw.intent);
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
      needsRetrieval: this.normalizeNeedsRetrieval(
        raw.needsRetrieval,
        intent,
        requiredEvidence,
      ),
      needsUserMemory: this.normalizeNeedsUserMemory(
        raw.needsUserMemory,
        intent,
      ),
      needsConversationSummary: this.normalizeNeedsConversationSummary(
        raw.needsConversationSummary,
        intent,
      ),
      needsVerification: this.normalizeNeedsVerification(
        raw.needsVerification,
        intent,
      ),
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

  private normalizeIntent(value: unknown): RagChatIntent {
    if (
      typeof value === 'string' &&
      this.validIntents.has(value as RagChatIntent)
    ) {
      return value as RagChatIntent;
    }

    return 'NORMAL_CHAT';
  }

  private normalizeReelQuestionType(
    value: unknown,
    intent: RagChatIntent,
  ): RagReelQuestionType {
    if (
      typeof value === 'string' &&
      this.validReelQuestionTypes.has(value as RagReelQuestionType)
    ) {
      if (intent !== 'REEL_VIDEO_QUESTION') {
        return 'NONE';
      }

      return value as RagReelQuestionType;
    }

    return intent === 'REEL_VIDEO_QUESTION'
      ? 'AMBIGUOUS_REEL_REFERENCE'
      : 'NONE';
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

      if (normalized.length > 0) {
        return this.enforceEvidenceByIntentAndType(
          normalized,
          intent,
          reelQuestionType,
        );
      }
    }

    return this.defaultRequiredEvidence(intent, reelQuestionType);
  }

  private normalizeRecommendationAction(
    value: unknown,
    intent: RagChatIntent,
  ): RagRecommendationAction {
    const record = this.asRecord(value);

    if (!record) {
      return {
        type: 'NONE',
        reason: 'Router returned no recommendation action.',
      };
    }

    const type = record.type;

    if (type === 'RECOMMEND_REELS') {
      const query = this.normalizeOptionalString(record.query);
      const minRelevantItems = this.normalizeInteger(
        record.minRelevantItems,
        2,
        1,
        8,
      );
      const allowPersonalizedFallback =
        typeof record.allowPersonalizedFallback === 'boolean'
          ? record.allowPersonalizedFallback
          : !query;

      return {
        type: 'RECOMMEND_REELS',
        ...(query ? { query } : {}),
        minRelevantItems,
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

    if (intent === 'REEL_VIDEO_QUESTION') {
      return {
        type: 'NONE',
        reason:
          'User asked about a shared reel, not for new reel recommendations.',
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

  private enforceEvidenceByIntentAndType(
    evidence: RagRequiredEvidence[],
    intent: RagChatIntent,
    reelQuestionType: RagReelQuestionType,
  ): RagRequiredEvidence[] {
    if (intent !== 'REEL_VIDEO_QUESTION') {
      return this.dedupeEvidence(evidence);
    }

    if (reelQuestionType === 'GENERAL_REEL_SUMMARY') {
      return this.dedupeEvidence([...evidence, 'TRANSCRIPT', 'METADATA']);
    }

    if (reelQuestionType === 'TRANSCRIPT_CONTENT') {
      return this.dedupeEvidence([...evidence, 'TRANSCRIPT']);
    }

    if (reelQuestionType === 'REEL_METADATA') {
      return this.dedupeEvidence([...evidence, 'METADATA']);
    }

    if (reelQuestionType === 'VISUAL_CONTENT') {
      return this.dedupeEvidence([...evidence, 'VISUAL']);
    }

    return this.dedupeEvidence(evidence);
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

  private normalizeNeedsRetrieval(
    value: unknown,
    intent: RagChatIntent,
    requiredEvidence: RagRequiredEvidence[],
  ): boolean {
    if (intent !== 'REEL_VIDEO_QUESTION') {
      return false;
    }

    if (
      requiredEvidence.includes('TRANSCRIPT') ||
      requiredEvidence.includes('METADATA')
    ) {
      return true;
    }

    return typeof value === 'boolean' ? value : false;
  }

  private normalizeNeedsUserMemory(
    value: unknown,
    intent: RagChatIntent,
  ): boolean {
    if (typeof value === 'boolean') {
      return value;
    }

    return intent === 'NORMAL_CHAT' || intent === 'USER_MEMORY_QUESTION';
  }

  private normalizeNeedsConversationSummary(
    value: unknown,
    intent: RagChatIntent,
  ): boolean {
    if (typeof value === 'boolean') {
      return value;
    }

    return (
      intent === 'NORMAL_CHAT' ||
      intent === 'CONVERSATION_MEMORY_QUESTION' ||
      intent === 'REEL_VIDEO_QUESTION'
    );
  }

  private normalizeNeedsVerification(
    value: unknown,
    intent: RagChatIntent,
  ): boolean {
    if (typeof value === 'boolean') {
      return value;
    }

    return intent !== 'NORMAL_CHAT';
  }

  private dedupeEvidence(
    evidence: RagRequiredEvidence[],
  ): RagRequiredEvidence[] {
    const deduped = [...new Set(evidence)];

    if (deduped.length > 1) {
      return deduped.filter((item) => item !== 'NONE');
    }

    return deduped;
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

  private normalizeInteger(
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

  private asRecord(value: unknown): RawRecord | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    return value as RawRecord;
  }

  private createNormalChatRoute(reason: string): RagChatRouteDecision {
    return {
      intent: 'NORMAL_CHAT',
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
