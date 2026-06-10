import type {
  RagChatIntent,
  RagChatRouteDecision,
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

  constructor(
    @Inject('IStructuredLlmService')
    private readonly structuredLlmService: IStructuredLlmService,
  ) {}

  async execute(input: {
    message: string;
    recentHistory?: string;
  }): Promise<RagChatRouteDecision> {
    const fastRoute = this.tryFastRoute(input.message);

    if (fastRoute) {
      return fastRoute;
    }

    try {
      const result =
        await this.structuredLlmService.generateObject<RawRouteDecision>({
          systemPrompt: this.buildSystemPrompt(),
          userPrompt: this.buildUserPrompt(input),
          jsonSchema: this.getJsonSchema(),
          maxTokens: 250,
          temperature: 0.1,
        });

      return this.normalize(result);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`[QueryRouterAgent] fallback NORMAL_CHAT: ${message}`);

      return {
        intent: 'NORMAL_CHAT',
        needsRetrieval: false,
        needsUserMemory: true,
        needsConversationSummary: true,
        needsVerification: false,
        reason: 'Fallback route because router failed.',
      };
    }
  }

  private tryFastRoute(message: string): RagChatRouteDecision | null {
    const text = message.toLowerCase().replace(/\s+/g, ' ').trim();

    if (!text) {
      return {
        intent: 'NORMAL_CHAT',
        needsRetrieval: false,
        needsUserMemory: true,
        needsConversationSummary: true,
        needsVerification: false,
        reason:
          'Fast route: empty or whitespace message treated as normal chat.',
      };
    }

    if (
      this.containsAny(text, ['reel', 'video', 'transcript', 'caption', 'clip'])
    ) {
      return {
        intent: 'REEL_VIDEO_QUESTION',
        needsRetrieval: true,
        needsUserMemory: true,
        needsConversationSummary: true,
        needsVerification: true,
        reason: 'Fast route: message refers to reel/video content.',
      };
    }

    if (
      this.containsAny(text, [
        'what did we',
        'what have we',
        'earlier',
        'previously',
        'last time',
        'what did we implement',
        'what have we done',
      ])
    ) {
      return {
        intent: 'CONVERSATION_MEMORY_QUESTION',
        needsRetrieval: false,
        needsUserMemory: false,
        needsConversationSummary: true,
        needsVerification: true,
        reason: 'Fast route: message asks about previous conversation context.',
      };
    }

    if (
      this.containsAny(text, [
        'what do you know about me',
        'what do you remember about me',
        'my preference',
        'my preferences',
        'about me',
      ])
    ) {
      return {
        intent: 'USER_MEMORY_QUESTION',
        needsRetrieval: false,
        needsUserMemory: true,
        needsConversationSummary: false,
        needsVerification: true,
        reason: 'Fast route: message asks about long-term user memory.',
      };
    }

    if (text.length <= 180) {
      return {
        intent: 'NORMAL_CHAT',
        needsRetrieval: false,
        needsUserMemory: true,
        needsConversationSummary: true,
        needsVerification: false,
        reason: 'Fast route: short non-video message treated as normal chat.',
      };
    }

    return null;
  }

  private containsAny(text: string, values: string[]): boolean {
    return values.some((value) => text.includes(value));
  }

  private buildSystemPrompt(): string {
    return `
You are a query router for a RAG chatbot.

Classify the current user message into one intent.

Intent meanings:
- NORMAL_CHAT: normal conversation, clarification, coding discussion, or general help.
- REEL_VIDEO_QUESTION: the user asks about reel/video/transcript/media content.
- CONVERSATION_MEMORY_QUESTION: the user asks what happened earlier in this conversation.
- USER_MEMORY_QUESTION: the user asks about stable facts/preferences/profile known about the user.
- TASK_ACTION_REQUEST: the user asks the system to perform an external action or tool operation.

Rules:
1. Return only structured JSON matching the schema.
2. Do not answer the user.
3. Do not invent context.
4. Retrieval is needed only for reel/video/content questions.
5. Conversation summary is useful for earlier-discussion questions and normal follow-up context.
6. User memory is useful for preferences, stable user context, and personalized help.
7. Verification is useful for reel/video, memory recall, or task/action answers.
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
        reason: { type: 'string' },
      },
    };
  }

  private normalize(raw: RawRouteDecision): RagChatRouteDecision {
    const intent =
      typeof raw.intent === 'string' &&
      this.validIntents.has(raw.intent as RagChatIntent)
        ? (raw.intent as RagChatIntent)
        : 'NORMAL_CHAT';

    return {
      intent,
      needsRetrieval:
        typeof raw.needsRetrieval === 'boolean'
          ? raw.needsRetrieval
          : intent === 'REEL_VIDEO_QUESTION',
      needsUserMemory:
        typeof raw.needsUserMemory === 'boolean' ? raw.needsUserMemory : true,
      needsConversationSummary:
        typeof raw.needsConversationSummary === 'boolean'
          ? raw.needsConversationSummary
          : true,
      needsVerification:
        typeof raw.needsVerification === 'boolean'
          ? raw.needsVerification
          : intent !== 'NORMAL_CHAT',
      reason:
        typeof raw.reason === 'string' && raw.reason.trim()
          ? raw.reason.trim()
          : 'No router reason provided.',
    };
  }
}
