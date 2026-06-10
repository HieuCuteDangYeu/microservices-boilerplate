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
          maxTokens: 350,
          temperature: 0.1,
        });

      return this.normalize(raw);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`[VerifierAgent] fallback pass: ${message}`);

      return {
        passed: true,
        confidence: 0.5,
        issues: ['Verifier failed, fallback pass was used.'],
        requiresRevision: false,
      };
    }
  }

  private buildSystemPrompt(): string {
    return `
You are a verifier agent for a RAG chatbot answer.

Check:
- Whether the answer is grounded in the available context.
- Whether reel/video claims are supported by retrieved chunks.
- Whether memory recall is supported by recent history, conversation summary, or user memory.
- Whether the answer is safe and not overconfident.

Rules:
1. Return only structured JSON matching the schema.
2. Do not rewrite the answer directly.
3. If revision is needed, provide a short instruction for the answer agent.
4. Do not require revision for harmless style differences.
`.trim();
  }

  private buildUserPrompt(state: RagChatWorkflowState): string {
    return `
Intent:
${state.route?.intent ?? 'UNKNOWN'}

User message:
${state.userMessage}

Answer:
${state.answer || ''}

Conversation summary:
${state.conversationMemory?.summary || '(empty)'}

User memories:
${JSON.stringify(state.userMemories?.memories ?? [])}

Retrieved chunks:
${JSON.stringify(
  state.rerankedChunks.map((chunk) => ({
    chunkId: chunk.chunkId,
    reelId: chunk.reelId,
    title: chunk.title,
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
      passed: typeof raw.passed === 'boolean' ? raw.passed : true,
      confidence,
      issues,
      requiresRevision:
        typeof raw.requiresRevision === 'boolean'
          ? raw.requiresRevision
          : false,
      revisedInstruction:
        typeof raw.revisedInstruction === 'string'
          ? raw.revisedInstruction.trim()
          : undefined,
    };
  }
}
