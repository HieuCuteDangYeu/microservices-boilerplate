import type { RagChatWorkflowState } from '@ai/domain/interfaces/rag-chat-workflow.interface';
import type { IStructuredLlmService } from '@ai/domain/interfaces/structured-llm.service.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';

interface RawRewriteResult {
  query?: unknown;
}

@Injectable()
export class RewriteRetrievalQueryUseCase {
  private readonly logger = new Logger(RewriteRetrievalQueryUseCase.name);

  constructor(
    @Inject('IStructuredLlmService')
    private readonly structuredLlmService: IStructuredLlmService,
  ) {}

  async execute(state: RagChatWorkflowState): Promise<string> {
    try {
      const result =
        await this.structuredLlmService.generateObject<RawRewriteResult>({
          systemPrompt: [
            'You rewrite a failed reel-RAG retrieval query.',
            'Return one concise search query only through the requested JSON schema.',
            'Preserve all entities, names, numbers, quoted text, and modality constraints from the user question.',
            'Use the failure reason to make the query more explicit, but never invent new facts.',
            'Do not answer the user.',
          ].join(' '),
          userPrompt: [
            `USER QUESTION:\n${state.userMessage}`,
            `REQUIRED EVIDENCE:\n${state.route?.requiredEvidence.join(', ') || 'UNKNOWN'}`,
            `PREVIOUS QUERIES:\n${(state.retrievalPlan?.queries ?? [state.retrievalPlan?.rewrittenQuery, state.retrievalPlan?.query]).filter(Boolean).join(' | ')}`,
            `SUFFICIENCY FAILURE:\n${state.contextSufficiency?.reason ?? 'Retrieved evidence was insufficient.'}`,
            `MISSING EVIDENCE:\n${state.contextSufficiency?.missingEvidence.join(', ') || 'NONE'}`,
          ].join('\n\n'),
          jsonSchema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
            required: ['query'],
            additionalProperties: false,
          },
          maxTokens: 120,
          temperature: 0,
          timeoutMs: 3_000,
        });

      if (typeof result.query === 'string' && result.query.trim()) {
        return result.query.replace(/\s+/g, ' ').trim().slice(0, 500);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`[RetrievalRepair] query rewrite failed: ${message}`);
    }

    return state.userMessage.trim();
  }
}
