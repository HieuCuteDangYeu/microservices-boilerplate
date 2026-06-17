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
          temperature: 0.1,
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
You are a query router for a RAG chatbot.

Classify the current user message into one intent and decide what evidence is required.

Intent meanings:
- NORMAL_CHAT: normal conversation, clarification, coding discussion, or general help.
- REEL_VIDEO_QUESTION: the user asks about a reel/video shared in the conversation.
- CONVERSATION_MEMORY_QUESTION: the user asks what happened earlier in this conversation.
- USER_MEMORY_QUESTION: the user asks about stable facts/preferences/profile known about the user.
- TASK_ACTION_REQUEST: the user asks the system to perform an external action or tool operation.

Reel question type meanings:
- NONE: not a reel/video question.
- TRANSCRIPT_CONTENT: asks what the reel says, explains, discusses, mentions, captions, or teaches.
- VISUAL_CONTENT: asks about what is seen on screen, visual appearance, objects, colors, faces, layout, or imagery.
- GENERAL_REEL_SUMMARY: asks for a summary or overview of the reel.
- REEL_METADATA: asks about title, caption, tags, author, sharing, or metadata.
- AMBIGUOUS_REEL_REFERENCE: mentions a reel but does not clearly ask a content question.

Evidence meanings:
- TRANSCRIPT: transcript/text chunks are needed.
- VISUAL: visual frame analysis is needed.
- AUDIO: non-speech audio evidence is needed.
- METADATA: reel title, caption, tags, or sharing metadata is needed.
- CONVERSATION_MEMORY: recent/history summary is needed.
- USER_MEMORY: long-term user memory is needed.
- NONE: no special evidence is needed.

Rules:
1. Return only structured JSON matching the schema.
2. Do not answer the user.
3. Do not invent context.
4. Mentioning "reel" or "video" alone does not automatically mean VISUAL_CONTENT.
5. Use VISUAL_CONTENT only when the user asks for visual evidence, not when they ask what the reel says or summarizes.
6. Questions about what is said, explained, discussed, mentioned, or captioned require TRANSCRIPT evidence.
7. General reel summaries usually require TRANSCRIPT evidence.
8. Reel metadata questions require METADATA evidence.
9. Retrieval is needed for REEL_VIDEO_QUESTION when transcript or metadata evidence is needed.
10. Conversation summary is useful for earlier-discussion questions and normal follow-up context.
11. User memory is useful for preferences, stable user context, and personalized help.
12. Verification is useful for reel/video, memory recall, or task/action answers.
`.trim();
  }

  private buildUserPrompt(input: {
    message: string;
    recentHistory?: string;
  }): string {
    return `
Current user message:
${input.message}

Recent history, if available:
${input.recentHistory || '(empty)'}
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

    const needsRetrieval =
      typeof raw.needsRetrieval === 'boolean'
        ? raw.needsRetrieval
        : this.defaultNeedsRetrieval(intent, requiredEvidence);

    return {
      intent,
      needsRetrieval,
      needsUserMemory:
        typeof raw.needsUserMemory === 'boolean'
          ? raw.needsUserMemory
          : intent === 'NORMAL_CHAT' || intent === 'USER_MEMORY_QUESTION',
      needsConversationSummary:
        typeof raw.needsConversationSummary === 'boolean'
          ? raw.needsConversationSummary
          : intent === 'NORMAL_CHAT' ||
            intent === 'CONVERSATION_MEMORY_QUESTION',
      needsVerification:
        typeof raw.needsVerification === 'boolean'
          ? raw.needsVerification
          : intent !== 'NORMAL_CHAT',
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
        return this.dedupeEvidence(normalized);
      }
    }

    if (intent === 'REEL_VIDEO_QUESTION') {
      if (reelQuestionType === 'VISUAL_CONTENT') {
        return ['VISUAL'];
      }

      if (reelQuestionType === 'REEL_METADATA') {
        return ['METADATA'];
      }

      return ['TRANSCRIPT'];
    }

    if (intent === 'CONVERSATION_MEMORY_QUESTION') {
      return ['CONVERSATION_MEMORY'];
    }

    if (intent === 'USER_MEMORY_QUESTION') {
      return ['USER_MEMORY'];
    }

    return ['NONE'];
  }

  private defaultNeedsRetrieval(
    intent: RagChatIntent,
    requiredEvidence: RagRequiredEvidence[],
  ): boolean {
    if (intent !== 'REEL_VIDEO_QUESTION') {
      return false;
    }

    return requiredEvidence.some(
      (item) => item === 'TRANSCRIPT' || item === 'METADATA',
    );
  }

  private dedupeEvidence(
    evidence: RagRequiredEvidence[],
  ): RagRequiredEvidence[] {
    return [...new Set(evidence)];
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
