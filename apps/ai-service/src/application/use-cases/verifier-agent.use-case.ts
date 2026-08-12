import type {
  RagChatWorkflowState,
  RagVerificationResult,
} from '@ai/domain/interfaces/rag-chat-workflow.interface';
import type {
  IStructuredLlmService,
  StructuredLlmJsonSchema,
} from '@ai/domain/interfaces/structured-llm.service.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';

interface RawVerificationResult {
  passed?: unknown;
  confidence?: unknown;
  issues?: unknown;
  requiresRevision?: unknown;
  revisedInstruction?: unknown;
}

@Injectable()
export class VerifierAgentUseCase {
  private readonly logger = new Logger(VerifierAgentUseCase.name);

  constructor(
    @Inject('IStructuredLlmService')
    private readonly structuredLlmService: IStructuredLlmService,
  ) {}

  async execute(state: RagChatWorkflowState): Promise<RagVerificationResult> {
    if (!state.route?.needsVerification) {
      return {
        passed: true,
        confidence: 1,
        issues: [],
        requiresRevision: false,
      };
    }

    try {
      const raw =
        await this.structuredLlmService.generateObject<RawVerificationResult>({
          systemPrompt: this.buildSystemPrompt(),
          userPrompt: this.buildUserPrompt(state),
          jsonSchema: this.getJsonSchema(),
          maxTokens: 450,
          temperature: 0,
          timeoutMs: 4_000,
        });

      return this.normalize(raw);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const groundedFallback = this.canDeterministicallyPass(state);
      this.logger.warn(
        `[VerifierAgent] provider failed; deterministic fallback passed=${groundedFallback}: ${message}`,
      );

      return {
        passed: groundedFallback,
        confidence: groundedFallback ? 0.55 : 0.2,
        issues: ['Verifier provider failed; deterministic grounding fallback was used.'],
        requiresRevision: false,
      };
    }
  }

  private buildSystemPrompt(): string {
    return `
You are a verifier agent for a production RAG chatbot answer.

Check:
- Whether every factual answer claim is grounded in the supplied evidence or selected memory context.
- Whether reel/video claims use the correct evidence modality.
- Whether visual claims are limited to sampled-frame evidence at the supplied timestamps.
- Whether transcript claims are actually stated by transcript evidence.
- Whether metadata claims come from metadata evidence.
- Whether memory recall is supported by recent history, conversation summary, or user memory.
- Whether the answer adds unsupported causes, identities, quantities, chronology, or certainty.

Rules:
1. Return only structured JSON matching the schema.
2. Do not rewrite the answer directly.
3. If revision is needed, provide a short concrete instruction for the answer agent.
4. Do not require revision for harmless style differences.
5. Retrieval text and search-enrichment fields are not evidence. Judge reel claims only from evidenceText supplied below.
6. If a required factual claim is unsupported, passed must be false.
`.trim();
  }

  private buildUserPrompt(state: RagChatWorkflowState): string {
    return `
Intent:
${state.route?.intent ?? 'UNKNOWN'}

Required evidence:
${state.route?.requiredEvidence.join(', ') || 'NONE'}

User message:
${state.userMessage}

Answer:
${state.answer || ''}

Conversation summary:
${state.conversationMemory?.summary || '(empty)'}

User memories:
${JSON.stringify(state.userMemories?.memories ?? [])}

Grounded reel evidence:
${JSON.stringify(
  state.rerankedChunks.map((chunk, index) => ({
    evidenceId: `e${index}`,
    evidenceType: chunk.evidenceType ?? 'TRANSCRIPT',
    title: chunk.title,
    startTime: chunk.startTime,
    endTime: chunk.endTime,
    evidenceText:
      chunk.evidenceText?.trim() ||
      (chunk.evidenceType === 'METADATA' ? chunk.chunkText.trim() : undefined),
  })),
)}
`.trim();
  }

  private getJsonSchema(): StructuredLlmJsonSchema {
    return {
      type: 'object',
      additionalProperties: false,
      required: [
        'passed',
        'confidence',
        'issues',
        'requiresRevision',
        'revisedInstruction',
      ],
      properties: {
        passed: { type: 'boolean' },
        confidence: { type: 'number' },
        issues: {
          type: 'array',
          items: { type: 'string' },
        },
        requiresRevision: { type: 'boolean' },
        revisedInstruction: { type: 'string' },
      },
    };
  }

  private normalize(raw: RawVerificationResult): RagVerificationResult {
    const issues = Array.isArray(raw.issues)
      ? raw.issues.filter((item): item is string => typeof item === 'string')
      : [];

    const confidence =
      typeof raw.confidence === 'number' && Number.isFinite(raw.confidence)
        ? Math.min(Math.max(raw.confidence, 0), 1)
        : 0.5;

    return {
      passed: typeof raw.passed === 'boolean' ? raw.passed : false,
      confidence,
      issues,
      requiresRevision:
        typeof raw.requiresRevision === 'boolean'
          ? raw.requiresRevision
          : !raw.passed,
      revisedInstruction:
        typeof raw.revisedInstruction === 'string'
          ? raw.revisedInstruction.trim()
          : undefined,
    };
  }

  private canDeterministicallyPass(state: RagChatWorkflowState): boolean {
    if (!state.route?.needsVerification) return true;
    if (!state.route.needsRetrieval) return true;
    if (state.contextSufficiency?.sufficient !== true) return false;

    const required = state.route.requiredEvidence.filter(
      (value) => value !== 'NONE',
    );
    if (required.length === 0) return true;

    return required.every((requiredEvidence) => {
      if (requiredEvidence === 'AUDIO') return false;
      if (
        requiredEvidence === 'CONVERSATION_MEMORY' ||
        requiredEvidence === 'USER_MEMORY'
      ) {
        return true;
      }

      return state.rerankedChunks.some((chunk) => {
        const type = chunk.evidenceType ?? 'TRANSCRIPT';
        const evidence =
          chunk.evidenceText?.trim() ||
          (type === 'METADATA' ? chunk.chunkText.trim() : '');
        return type === requiredEvidence && Boolean(evidence);
      });
    });
  }
}
