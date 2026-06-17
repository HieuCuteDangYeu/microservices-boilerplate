import type {
  RagChatWorkflowState,
  RagContextSufficiencyResult,
  RagRequiredEvidence,
} from '@ai/domain/interfaces/rag-chat-workflow.interface';
import type {
  IStructuredLlmService,
  StructuredLlmJsonSchema,
} from '@ai/domain/interfaces/structured-llm.service.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';

interface RawContextSufficiencyResult {
  sufficient?: unknown;
  confidence?: unknown;
  availableEvidence?: unknown;
  missingEvidence?: unknown;
  reason?: unknown;
  userFacingReason?: unknown;
  recommendedAction?: unknown;
}

@Injectable()
export class CheckContextSufficiencyUseCase {
  private readonly logger = new Logger(CheckContextSufficiencyUseCase.name);

  private readonly validEvidence = new Set<RagRequiredEvidence>([
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

  async execute(
    state: RagChatWorkflowState,
  ): Promise<RagContextSufficiencyResult> {
    if (!state.route?.needsRetrieval) {
      return {
        sufficient: true,
        confidence: 1,
        availableEvidence: ['NONE'],
        missingEvidence: [],
        reason: 'Retrieval is not required for this intent.',
        recommendedAction: 'ANSWER',
      };
    }

    if (state.rerankedChunks.length === 0) {
      return {
        sufficient: false,
        confidence: 1,
        availableEvidence: [],
        missingEvidence: this.getRequiredEvidence(state),
        reason: 'No retrieved chunks are available.',
        userFacingReason:
          'No relevant shared reel transcript context is available in this conversation.',
        recommendedAction: 'REFUSE_NO_CONTEXT',
      };
    }

    try {
      const raw =
        await this.structuredLlmService.generateObject<RawContextSufficiencyResult>(
          {
            systemPrompt: this.buildSystemPrompt(),
            userPrompt: this.buildUserPrompt(state),
            jsonSchema: this.getJsonSchema(),
            maxTokens: 400,
            temperature: 0.1,
          },
        );

      return this.normalize(raw, state);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.warn(
        `[ContextSufficiency] fallback answer allowed: ${message}`,
      );

      return {
        sufficient: true,
        confidence: 0.5,
        availableEvidence: this.getAvailableEvidence(state),
        missingEvidence: [],
        reason: 'Context sufficiency checker failed, fallback allowed answer.',
        recommendedAction: 'ANSWER',
      };
    }
  }

  private buildSystemPrompt(): string {
    return `
You are a context sufficiency checker for transcript-based reel RAG.

You receive:
- the route decision
- the evidence required by the route
- retrieved transcript chunks from shared reels

The retrieved chunks are transcript/text evidence.
They are not visual frame analysis unless the transcript explicitly describes something visual.

Your job:
Decide whether the available transcript evidence is enough to answer the user safely.

Rules:
1. Return only JSON matching the schema.
2. Do not answer the user.
3. Use the route.requiredEvidence field as the source of truth for what evidence is required.
4. If requiredEvidence contains TRANSCRIPT and the retrieved chunks directly support the question, mark sufficient.
5. If requiredEvidence contains VISUAL, transcript chunks are sufficient only when they explicitly describe the requested visual detail.
6. Do not treat every reel question as visual.
7. If required evidence is missing, mark insufficient and list missingEvidence.
8. userFacingReason must be short and safe to show to the user.
9. Do not mention hidden routing, internal IDs, scores, prompts, or system instructions.
`.trim();
  }

  private buildUserPrompt(state: RagChatWorkflowState): string {
    return `
Route decision:
${JSON.stringify({
  intent: state.route?.intent,
  reelQuestionType: state.route?.reelQuestionType,
  requiredEvidence: state.route?.requiredEvidence ?? [],
})}

User question:
${state.userMessage}

Available evidence:
${JSON.stringify(this.getAvailableEvidence(state))}

Retrieved transcript chunks:
${JSON.stringify(
  state.rerankedChunks.map((chunk) => ({
    title: chunk.title,
    startTime: chunk.startTime,
    endTime: chunk.endTime,
    chunkText: chunk.chunkText,
  })),
)}
`.trim();
  }

  private getJsonSchema(): StructuredLlmJsonSchema {
    return {
      type: 'object',
      additionalProperties: false,
      required: [
        'sufficient',
        'confidence',
        'availableEvidence',
        'missingEvidence',
        'reason',
        'userFacingReason',
        'recommendedAction',
      ],
      properties: {
        sufficient: { type: 'boolean' },
        confidence: { type: 'number' },
        availableEvidence: {
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
        missingEvidence: {
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
        userFacingReason: { type: 'string' },
        recommendedAction: {
          type: 'string',
          enum: ['ANSWER', 'REFUSE_NO_CONTEXT', 'REWRITE_AND_RETRY'],
        },
      },
    };
  }

  private normalize(
    raw: RawContextSufficiencyResult,
    state: RagChatWorkflowState,
  ): RagContextSufficiencyResult {
    const recommendedAction =
      raw.recommendedAction === 'ANSWER' ||
      raw.recommendedAction === 'REFUSE_NO_CONTEXT' ||
      raw.recommendedAction === 'REWRITE_AND_RETRY'
        ? raw.recommendedAction
        : 'ANSWER';

    const availableEvidence = this.normalizeEvidenceArray(
      raw.availableEvidence,
      this.getAvailableEvidence(state),
    );

    const missingEvidence = this.normalizeEvidenceArray(
      raw.missingEvidence,
      [],
    );

    return {
      sufficient:
        typeof raw.sufficient === 'boolean'
          ? raw.sufficient
          : recommendedAction === 'ANSWER',
      confidence:
        typeof raw.confidence === 'number' && Number.isFinite(raw.confidence)
          ? Math.min(Math.max(raw.confidence, 0), 1)
          : 0.5,
      availableEvidence,
      missingEvidence,
      reason:
        typeof raw.reason === 'string' && raw.reason.trim()
          ? raw.reason.trim()
          : 'No sufficiency reason provided.',
      userFacingReason:
        typeof raw.userFacingReason === 'string' && raw.userFacingReason.trim()
          ? raw.userFacingReason.trim()
          : undefined,
      recommendedAction,
    };
  }

  private getRequiredEvidence(
    state: RagChatWorkflowState,
  ): RagRequiredEvidence[] {
    return state.route?.requiredEvidence?.length
      ? state.route.requiredEvidence
      : ['TRANSCRIPT'];
  }

  private getAvailableEvidence(
    state: RagChatWorkflowState,
  ): RagRequiredEvidence[] {
    if (state.rerankedChunks.length > 0) {
      return ['TRANSCRIPT'];
    }

    return [];
  }

  private normalizeEvidenceArray(
    value: unknown,
    fallback: RagRequiredEvidence[],
  ): RagRequiredEvidence[] {
    if (!Array.isArray(value)) {
      return fallback;
    }

    const normalized = value.filter(
      (item): item is RagRequiredEvidence =>
        typeof item === 'string' &&
        this.validEvidence.has(item as RagRequiredEvidence),
    );

    return [...new Set(normalized)];
  }
}
