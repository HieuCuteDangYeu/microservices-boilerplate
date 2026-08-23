import type { IAiApplicationConfig } from '@ai/domain/interfaces/ai-application-config.interface';
import type {
  RagChatWorkflowState,
  RagVerificationResult,
} from '@ai/domain/interfaces/rag-chat-workflow.interface';
import type {
  IStructuredLlmService,
  StructuredLlmJsonSchema,
} from '@ai/domain/interfaces/structured-llm.service.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { assessDirectTranscriptFactSupport } from './direct-transcript-fact-support';

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
    @Inject('IAiApplicationConfig')
    private readonly config?: IAiApplicationConfig,
  ) {}

  async execute(state: RagChatWorkflowState): Promise<RagVerificationResult> {
    if (!state.route?.needsVerification) {
      return {
        passed: true,
        confidence: 1,
        issues: [],
        requiresRevision: false,
        diagnostics: {
          providerStatus: 'NOT_CALLED',
          decisionSource: 'NOT_REQUIRED',
          finalPassed: true,
          confidence: 1,
          issues: [],
          requiresRevision: false,
          directSupport: { supported: false, supportingEvidenceIndexes: [] },
        },
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
          model:
            this.config?.get<string>('CLOUDFLARE_VERIFIER_MODEL') ||
            '@cf/meta/llama-3.1-8b-instruct-fast',
          timeoutMs: this.timeout('AI_RAG_VERIFIER_TIMEOUT_MS'),
        });

      const verification = this.normalize(raw);
      const directSupport = assessDirectTranscriptFactSupport({
        question: state.userMessage,
        answer: state.answer ?? '',
        candidates: state.rerankedChunks.map((chunk) => ({
          evidenceType: chunk.evidenceType ?? 'TRANSCRIPT',
          evidenceText:
            chunk.evidenceText?.trim() ||
            (chunk.evidenceType === 'METADATA' ? chunk.chunkText.trim() : ''),
        })),
      });

      if (!verification.passed && directSupport.supported) {
        return {
          passed: true,
          confidence: 1,
          issues: [
            ...verification.issues,
            'A compact factual answer is directly supported by transcript evidence.',
          ],
          requiresRevision: false,
          diagnostics: {
            providerStatus: 'SUCCESS',
            decisionSource: 'DETERMINISTIC_DIRECT_SUPPORT',
            providerPassed: false,
            finalPassed: true,
            confidence: 1,
            issues: [...verification.issues],
            requiresRevision: false,
            directSupport,
          },
        };
      }

      return {
        ...verification,
        diagnostics: {
          providerStatus: 'SUCCESS',
          decisionSource: 'LLM',
          providerPassed: verification.passed,
          finalPassed: verification.passed,
          confidence: verification.confidence,
          issues: verification.issues,
          requiresRevision: verification.requiresRevision,
          revisedInstruction: verification.revisedInstruction,
          directSupport,
        },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[VerifierAgent] provider failed; required verification is fail-closed: ${message}`,
      );

      const directSupport = assessDirectTranscriptFactSupport({
        question: state.userMessage,
        answer: state.answer ?? '',
        candidates: state.rerankedChunks.map((chunk) => ({
          evidenceType: chunk.evidenceType ?? 'TRANSCRIPT',
          evidenceText:
            chunk.evidenceText?.trim() ||
            (chunk.evidenceType === 'METADATA' ? chunk.chunkText.trim() : ''),
        })),
      });
      if (directSupport.supported) {
        return {
          passed: true,
          confidence: 1,
          issues: [
            'Verifier provider was unavailable; a compact factual answer is directly supported by transcript evidence.',
          ],
          requiresRevision: false,
          diagnostics: {
            providerStatus: 'ERROR',
            decisionSource: 'DETERMINISTIC_DIRECT_SUPPORT',
            finalPassed: true,
            confidence: 1,
            issues: [
              'Verifier provider was unavailable; a compact factual answer is directly supported by transcript evidence.',
            ],
            requiresRevision: false,
            directSupport,
          },
        };
      }

      return {
        passed: false,
        confidence: 0,
        issues: ['Required answer verification was unavailable.'],
        requiresRevision: false,
        diagnostics: {
          providerStatus: 'ERROR',
          decisionSource: 'FAIL_CLOSED',
          finalPassed: false,
          confidence: 0,
          issues: ['Required answer verification was unavailable.'],
          requiresRevision: false,
          directSupport,
        },
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
- Whether the answer responds to the exact relation or slot requested by the user; a fact can be present in evidence but still be the wrong answer.
- Whether supplied evidence contradicts the answer or supports a materially different value for the requested relation.

Rules:
1. Return only structured JSON matching the schema.
2. Do not rewrite the answer directly.
3. If revision is needed, provide a short concrete instruction for the answer agent.
4. Do not require revision for harmless style differences.
5. Retrieval text and search-enrichment fields are not evidence. Judge reel claims only from evidenceText supplied below.
6. If a required factual claim is unsupported, passed must be false.
7. A direct claim that a fact is visible is supported when grounded visual evidence contains that fact. The answer does not need to repeat the evidence timestamp unless the user asks when it appears or the answer makes a timing claim.
8. Do not pass an answer that substitutes a nearby count, property, or topic for the requested person, location, cause, safety measure, or other relation.
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

  private timeout(key: string): number {
    const configured = Number(this.config?.get<string>(key) ?? '8000');
    return Number.isFinite(configured)
      ? Math.min(30_000, Math.max(500, Math.round(configured)))
      : 8_000;
  }
}
