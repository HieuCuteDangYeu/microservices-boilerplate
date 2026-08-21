import type {
  RagChatWorkflowState,
  RagContextSufficiencyResult,
  RagRequiredEvidence,
} from '@ai/domain/interfaces/rag-chat-workflow.interface';
import type {
  IStructuredLlmService,
  StructuredLlmJsonSchema,
} from '@ai/domain/interfaces/structured-llm.service.interface';
import type { ReelContextSearchResult } from '@common/content/interfaces/reel-context-search-result.interface';
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
        reason: 'No retrieved reel evidence is available.',
        userFacingReason:
          'No relevant shared reel evidence is available in this conversation.',
        recommendedAction: 'REFUSE_NO_CONTEXT',
      };
    }

    const availableEvidence = this.getAvailableEvidence(state);
    const deterministicallyMissing = this.getRequiredEvidence(state).filter(
      (required) =>
        required !== 'NONE' && !availableEvidence.includes(required),
    );
    if (deterministicallyMissing.length > 0) {
      return {
        sufficient: false,
        confidence: 1,
        availableEvidence,
        missingEvidence: deterministicallyMissing,
        reason: `Required evidence is unavailable: ${deterministicallyMissing.join(', ')}.`,
        userFacingReason: this.userFacingMissingEvidence(
          deterministicallyMissing,
        ),
        recommendedAction: 'REFUSE_NO_CONTEXT',
      };
    }

    const missingMentionTerms = this.missingExplicitMentionTerms(state);
    if (missingMentionTerms.length > 0) {
      return {
        sufficient: false,
        confidence: 1,
        availableEvidence,
        missingEvidence: ['TRANSCRIPT'],
        reason: `Retrieved transcript does not mention: ${missingMentionTerms.join(', ')}.`,
        userFacingReason:
          'I do not have relevant shared reel transcript context to answer that reliably.',
        recommendedAction: 'REFUSE_NO_CONTEXT',
      };
    }

    if (this.hasExplicitQuantitySupport(state)) {
      return {
        sufficient: true,
        confidence: 1,
        availableEvidence,
        missingEvidence: [],
        reason:
          'Retrieved transcript explicitly supplies the quantity requested by the user.',
        recommendedAction: 'ANSWER',
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
        availableEvidence,
        missingEvidence: [],
        reason:
          'Context sufficiency checker failed after required evidence was verified.',
        recommendedAction: 'ANSWER',
      };
    }
  }

  private buildSystemPrompt(): string {
    return `
You are a context sufficiency checker for reel RAG.

You receive:
- the route decision
- the evidence required by the route
- retrieved evidence from shared reels

Retrieved evidence can be explicitly typed as:
- TRANSCRIPT: timestamped speech/transcript evidence
- VISUAL: timestamped sampled-frame evidence produced from visual captions, OCR, and visible objects
- METADATA: reel title, description, or tags

Visual evidence represents sampled frames, not continuous observation of every frame in the video. Do not infer what happened between sampled timestamps. Transcript evidence does not prove visual details. Visual evidence does not prove speech or non-speech audio.

Your job:
Decide whether the available evidence directly supports the user's question.

Rules:
1. Return only JSON matching the schema.
2. Do not answer the user.
3. Use route.requiredEvidence as the source of truth for the required modalities.
4. TRANSCRIPT is available only from transcript-typed evidence.
5. VISUAL is available only from visual-typed sampled-frame evidence.
6. METADATA is available when title, description, or tags are present.
7. AUDIO requires explicit audio evidence; transcript text alone is not non-speech audio evidence.
8. Even when the required modality exists, mark insufficient if the retrieved evidence does not support the requested fact.
9. If evidence is missing, list it in missingEvidence.
10. userFacingReason must be short and safe to show to the user.
11. Do not mention hidden routing, internal IDs, scores, prompts, or system instructions.
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

Available evidence modalities:
${JSON.stringify(this.getAvailableEvidence(state))}

Retrieved reel evidence:
${JSON.stringify(
  state.rerankedChunks.map((chunk) => ({
    evidenceType: chunk.evidenceType ?? 'TRANSCRIPT',
    title: chunk.title,
    description: chunk.description,
    tags: chunk.tags,
    startTime: chunk.startTime,
    endTime: chunk.endTime,
    matchedBy: chunk.matchedBy,
    evidenceText: chunk.evidenceText ?? chunk.chunkText,
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
    const rawRecommendedAction =
      raw.recommendedAction === 'ANSWER' ||
      raw.recommendedAction === 'REFUSE_NO_CONTEXT' ||
      raw.recommendedAction === 'REWRITE_AND_RETRY'
        ? raw.recommendedAction
        : 'ANSWER';
    const sufficient =
      typeof raw.sufficient === 'boolean'
        ? raw.sufficient
        : rawRecommendedAction === 'ANSWER';
    const recommendedAction = sufficient
      ? 'ANSWER'
      : rawRecommendedAction === 'REWRITE_AND_RETRY'
        ? 'REWRITE_AND_RETRY'
        : 'REFUSE_NO_CONTEXT';
    const availableEvidence = this.normalizeEvidenceArray(
      raw.availableEvidence,
      this.getAvailableEvidence(state),
    );
    const missingEvidence = this.normalizeEvidenceArray(
      raw.missingEvidence,
      [],
    );
    return {
      sufficient,
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
    const evidence: RagRequiredEvidence[] = [];
    if (
      state.rerankedChunks.some(
        (chunk) =>
          (chunk.evidenceType ?? 'TRANSCRIPT') === 'TRANSCRIPT' &&
          this.hasEvidenceText(chunk),
      )
    ) {
      evidence.push('TRANSCRIPT');
    }
    if (
      state.rerankedChunks.some(
        (chunk) =>
          chunk.evidenceType === 'VISUAL' && this.hasEvidenceText(chunk),
      )
    ) {
      evidence.push('VISUAL');
    }
    if (state.rerankedChunks.some((chunk) => this.hasMetadata(chunk))) {
      evidence.push('METADATA');
    }
    return this.dedupeEvidence(evidence);
  }

  private missingExplicitMentionTerms(state: RagChatWorkflowState): string[] {
    if (state.route?.intent !== 'REEL_VIDEO_QUESTION') return [];
    if (!state.route.requiredEvidence.includes('TRANSCRIPT')) return [];

    const match = state.userMessage.match(
      /\b(?:does|did|do)\b[\s\S]*?\bmention\b\s+(.+?)[?.!]*$/i,
    );
    if (!match?.[1]) return [];

    const terms = match[1]
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((term) => term.length >= 3)
      .filter((term) => !['the', 'and', 'that', 'this'].includes(term));
    const evidence = state.rerankedChunks
      .filter((chunk) => (chunk.evidenceType ?? 'TRANSCRIPT') === 'TRANSCRIPT')
      .map((chunk) => (chunk.evidenceText ?? chunk.chunkText).toLowerCase())
      .join(' ');
    return terms.filter((term) => !evidence.includes(term));
  }

  private hasExplicitQuantitySupport(state: RagChatWorkflowState): boolean {
    if (state.route?.intent !== 'REEL_VIDEO_QUESTION') return false;
    if (!state.route.requiredEvidence.includes('TRANSCRIPT')) return false;
    if (!/\b(how many|what number)\b/i.test(state.userMessage)) return false;

    const terms = state.userMessage
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((term) => term.length >= 3)
      .filter(
        (term) =>
          ![
            'how',
            'many',
            'what',
            'number',
            'does',
            'speaker',
            'they',
            'say',
            'using',
          ].includes(term),
      );
    const evidence = state.rerankedChunks
      .filter((chunk) => (chunk.evidenceType ?? 'TRANSCRIPT') === 'TRANSCRIPT')
      .map((chunk) => (chunk.evidenceText ?? chunk.chunkText).toLowerCase())
      .join(' ');

    return (
      /\b\d+(?:\.\d+)?\b/.test(evidence) &&
      terms.some((term) => evidence.includes(term))
    );
  }

  private hasEvidenceText(chunk: ReelContextSearchResult): boolean {
    return (chunk.evidenceText ?? chunk.chunkText).trim().length > 0;
  }

  private hasMetadata(chunk: ReelContextSearchResult): boolean {
    return (
      this.hasText(chunk.title) ||
      this.hasText(chunk.description) ||
      chunk.tags.some((tag) => this.hasText(tag))
    );
  }

  private hasText(value: string | undefined): boolean {
    return typeof value === 'string' && value.trim().length > 0;
  }

  private userFacingMissingEvidence(missing: RagRequiredEvidence[]): string {
    if (missing.includes('VISUAL')) {
      return 'I do not have relevant sampled visual evidence from the shared reel to answer that reliably.';
    }
    if (missing.includes('AUDIO')) {
      return 'I do not have the required audio evidence from the shared reel to answer that reliably.';
    }
    if (missing.includes('TRANSCRIPT')) {
      return 'I do not have relevant shared reel transcript context to answer that reliably.';
    }
    return 'I do not have the required shared reel evidence to answer that reliably.';
  }

  private normalizeEvidenceArray(
    value: unknown,
    fallback: RagRequiredEvidence[],
  ): RagRequiredEvidence[] {
    if (!Array.isArray(value)) return fallback;
    const normalized = value.filter(
      (item): item is RagRequiredEvidence =>
        typeof item === 'string' &&
        this.validEvidence.has(item as RagRequiredEvidence),
    );
    return this.dedupeEvidence(normalized);
  }

  private dedupeEvidence(
    evidence: RagRequiredEvidence[],
  ): RagRequiredEvidence[] {
    const deduped = [...new Set(evidence)];
    return deduped.length > 1
      ? deduped.filter((item) => item !== 'NONE')
      : deduped;
  }
}
