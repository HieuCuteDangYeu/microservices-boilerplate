import type {
  RagChatWorkflowState,
  RagContextSufficiencyResult,
} from '@ai/domain/interfaces/rag-chat-workflow.interface';
import type {
  IStructuredLlmService,
  StructuredLlmJsonSchema,
} from '@ai/domain/interfaces/structured-llm.service.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';

interface RawContextSufficiencyResult {
  sufficient?: unknown;
  confidence?: unknown;
  reason?: unknown;
  missingInfo?: unknown;
  recommendedAction?: unknown;
}

@Injectable()
export class CheckContextSufficiencyUseCase {
  private readonly logger = new Logger(CheckContextSufficiencyUseCase.name);

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
        reason: 'Retrieval is not required for this intent.',
        recommendedAction: 'ANSWER',
      };
    }

    if (state.rerankedChunks.length === 0) {
      return {
        sufficient: false,
        confidence: 1,
        reason: 'No retrieved chunks are available.',
        missingInfo:
          'No relevant shared reel context is available in this conversation.',
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
            maxTokens: 300,
            temperature: 0.1,
          },
        );

      return this.normalize(raw);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.warn(
        `[ContextSufficiency] fallback answer allowed: ${message}`,
      );

      return {
        sufficient: true,
        confidence: 0.5,
        reason: 'Context sufficiency checker failed, fallback allowed answer.',
        recommendedAction: 'ANSWER',
      };
    }
  }

  private buildSystemPrompt(): string {
    return `
You are a context sufficiency checker for reel/video RAG.

Decide whether the retrieved chunks are enough to answer the user's question.

Rules:
1. Return only JSON matching the schema.
2. Do not answer the user.
3. If chunks are related but incomplete, mark insufficient.
4. If the user asks about visual details but chunks only contain transcript text, mark insufficient.
5. If enough evidence exists, recommendedAction must be ANSWER.
6. If no relevant evidence exists, recommendedAction must be REFUSE_NO_CONTEXT.
`.trim();
  }

  private buildUserPrompt(state: RagChatWorkflowState): string {
    return `
User question:
${state.userMessage}

Retrieved chunks:
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
        'reason',
        'missingInfo',
        'recommendedAction',
      ],
      properties: {
        sufficient: { type: 'boolean' },
        confidence: { type: 'number' },
        reason: { type: 'string' },
        missingInfo: { type: 'string' },
        recommendedAction: {
          type: 'string',
          enum: ['ANSWER', 'REFUSE_NO_CONTEXT', 'REWRITE_AND_RETRY'],
        },
      },
    };
  }

  private normalize(
    raw: RawContextSufficiencyResult,
  ): RagContextSufficiencyResult {
    const recommendedAction =
      raw.recommendedAction === 'ANSWER' ||
      raw.recommendedAction === 'REFUSE_NO_CONTEXT' ||
      raw.recommendedAction === 'REWRITE_AND_RETRY'
        ? raw.recommendedAction
        : 'ANSWER';

    return {
      sufficient:
        typeof raw.sufficient === 'boolean'
          ? raw.sufficient
          : recommendedAction === 'ANSWER',
      confidence:
        typeof raw.confidence === 'number' && Number.isFinite(raw.confidence)
          ? Math.min(Math.max(raw.confidence, 0), 1)
          : 0.5,
      reason:
        typeof raw.reason === 'string' && raw.reason.trim()
          ? raw.reason.trim()
          : 'No sufficiency reason provided.',
      missingInfo:
        typeof raw.missingInfo === 'string' && raw.missingInfo.trim()
          ? raw.missingInfo.trim()
          : undefined,
      recommendedAction,
    };
  }
}
