import type {
  RagChatIntent,
  RagChatRouteDecision,
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
  reason?: unknown;
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
          maxTokens: 350,
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
You are the semantic query router for a RAG chatbot.

Classify the current user message by meaning, not by keyword matching.

Return only JSON matching the schema.

Intent meanings:
- NORMAL_CHAT: general conversation, coding help, app discussion, clarification, or normal assistant chat.
- REEL_VIDEO_QUESTION: the user asks about a reel/video/clip/media item shared in the current conversation.
- CONVERSATION_MEMORY_QUESTION: the user asks what happened earlier in this conversation.
- USER_MEMORY_QUESTION: the user asks about stable facts, preferences, profile, or remembered user information.
- TASK_ACTION_REQUEST: the user asks the system to perform an external action or tool operation.

Reel question type meanings:
- NONE: not a reel/video question.
- TRANSCRIPT_CONTENT: asks what the reel says, explains, discusses, mentions, captions, quotes, or teaches.
- VISUAL_CONTENT: asks about visual appearance, objects, people, colors, text on screen, layout, or what is seen.
- GENERAL_REEL_SUMMARY: asks for the reel's overall meaning, summary, topic, main point, or what it is about.
- REEL_METADATA: asks about title, description, caption, hashtags, tags, author, upload/share metadata.
- AMBIGUOUS_REEL_REFERENCE: refers to a reel/video but the requested information is unclear.

Evidence meanings:
- TRANSCRIPT: spoken words, transcript chunks, captions, or textual reel content are needed.
- VISUAL: visual frame analysis or OCR is needed.
- AUDIO: non-speech audio, music, tone, sound effects, or background audio is needed.
- METADATA: title, description, caption, tags, hashtags, author, or share metadata is needed.
- CONVERSATION_MEMORY: recent conversation/history summary is needed.
- USER_MEMORY: long-term user memory is needed.
- NONE: no special evidence is needed.

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

  private createNormalChatRoute(reason: string): RagChatRouteDecision {
    return {
      intent: 'NORMAL_CHAT',
      needsRetrieval: false,
      needsUserMemory: true,
      needsConversationSummary: true,
      needsVerification: false,
      reelQuestionType: 'NONE',
      requiredEvidence: ['NONE'],
      reason,
    };
  }
}
