import type { IAiApplicationConfig } from '@ai/domain/interfaces/ai-application-config.interface';
import type { IChatPromptBuilder } from '@ai/domain/interfaces/chat-prompt-builder.interface';
import type {
  RagAnswerClaim,
  RagChatWorkflowState,
} from '@ai/domain/interfaces/rag-chat-workflow.interface';
import type {
  IStructuredLlmService,
  StructuredLlmCallDiagnostics,
  StructuredLlmJsonSchema,
} from '@ai/domain/interfaces/structured-llm.service.interface';
import { Inject, Injectable } from '@nestjs/common';

interface RawDraftAnswer {
  answer?: unknown;
  claims?: unknown;
}

export interface RagDraftAnswer {
  answer: string;
  claims: RagAnswerClaim[];
  modelRole: 'ANSWER';
  diagnostics: StructuredLlmCallDiagnostics[];
}

@Injectable()
export class GenerateDraftAnswerUseCase {
  constructor(
    @Inject('IStructuredLlmService')
    private readonly structuredLlmService: IStructuredLlmService,
    @Inject('IChatPromptBuilder')
    private readonly chatPromptBuilder: IChatPromptBuilder,
    @Inject('IAiApplicationConfig')
    private readonly config: IAiApplicationConfig,
  ) {}

  async execute(state: RagChatWorkflowState): Promise<RagDraftAnswer> {
    const diagnostics: StructuredLlmCallDiagnostics[] = [];
    const authorizedEvidence = state.rerankedChunks.map((chunk, index) => ({
      evidenceId: `e${index}`,
      evidenceType: chunk.evidenceType ?? 'TRANSCRIPT',
      evidenceText:
        chunk.evidenceText?.trim() ||
        (chunk.evidenceType === 'METADATA' ? chunk.chunkText.trim() : ''),
    }));
    const raw = await this.structuredLlmService.generateObject<RawDraftAnswer>({
      systemPrompt: [
        this.chatPromptBuilder.build(state, {
          includeRetrievedEvidence: false,
        }),
        'Return only JSON matching the supplied schema.',
        'For every factual claim about a reel, declare the exact authorized evidence IDs that support it.',
        'Do not declare an evidence ID for a claim unless its exact evidence text supports the requested relation and modality.',
        'Normal conversational statements that do not depend on reel evidence may have no claims.',
      ].join('\n\n'),
      userPrompt: JSON.stringify({
        currentQuestion: state.userMessage,
        authorizedEvidence,
      }),
      jsonSchema: this.schema(),
      model: this.config.model('ANSWER'),
      timeoutMs: this.config.timeoutMs('ANSWER'),
      temperature: 0,
      maxTokens: this.config.maxCompletionTokens('ANSWER'),
      modelRole: 'ANSWER',
      onDiagnostics: (call) => diagnostics.push(call),
    });

    return { ...this.normalize(raw, state), diagnostics };
  }

  private schema(): StructuredLlmJsonSchema {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['answer', 'claims'],
      properties: {
        answer: { type: 'string', maxLength: 2_500 },
        claims: {
          type: 'array',
          maxItems: 12,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['claim', 'evidenceIds'],
            properties: {
              claim: { type: 'string', maxLength: 500 },
              evidenceIds: {
                type: 'array',
                maxItems: 3,
                items: { type: 'string', maxLength: 64 },
              },
            },
          },
        },
      },
    };
  }

  private normalize(
    raw: RawDraftAnswer,
    state: RagChatWorkflowState,
  ): RagDraftAnswer {
    const answer = typeof raw.answer === 'string' ? raw.answer.trim() : '';
    if (!answer) throw new Error('Answer model returned an empty answer');

    const allowedIds = new Set(
      state.rerankedChunks.map((_chunk, index) => `e${index}`),
    );
    const claims = Array.isArray(raw.claims)
      ? raw.claims.map((value) => this.normalizeClaim(value, allowedIds))
      : [];
    if (state.route?.intent === 'REEL_VIDEO_QUESTION' && claims.length === 0) {
      throw new Error('Reel answer model returned no grounded claim mappings');
    }

    return { answer, claims, modelRole: 'ANSWER', diagnostics: [] };
  }

  private normalizeClaim(
    value: unknown,
    allowedIds: Set<string>,
  ): RagAnswerClaim {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Answer model returned a malformed claim mapping');
    }
    const record = value as Record<string, unknown>;
    const claim =
      typeof record['claim'] === 'string' ? record['claim'].trim() : '';
    const evidenceIds = Array.isArray(record['evidenceIds'])
      ? [
          ...new Set(
            record['evidenceIds'].filter(
              (id): id is string => typeof id === 'string',
            ),
          ),
        ]
      : [];
    if (!claim || evidenceIds.length === 0) {
      throw new Error('Reel factual claims require evidence IDs');
    }
    if (evidenceIds.some((id) => !allowedIds.has(id))) {
      throw new Error('Answer model returned an unknown evidence ID');
    }
    return { claim, evidenceIds };
  }
}
