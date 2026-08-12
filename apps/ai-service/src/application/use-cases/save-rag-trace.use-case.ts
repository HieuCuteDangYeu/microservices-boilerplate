import type { RagChatWorkflowState } from '@ai/domain/interfaces/rag-chat-workflow.interface';
import type { IRagTraceRepository } from '@ai/domain/interfaces/rag-trace.repository.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SaveRagTraceUseCase {
  private readonly logger = new Logger(SaveRagTraceUseCase.name);

  constructor(
    @Inject('IRagTraceRepository')
    private readonly ragTraceRepository: IRagTraceRepository,
  ) {}

  async execute(input: {
    state: RagChatWorkflowState;
    latencyMs: number;
    nodeTimings: Record<string, number>;
  }): Promise<void> {
    try {
      await this.ragTraceRepository.create({
        userId: input.state.userId,
        conversationId: input.state.conversationId,
        message: input.state.userMessage,

        intent: input.state.route?.intent,
        needsRetrieval: input.state.route?.needsRetrieval ?? false,

        retrievedChunkIds: input.state.retrievedChunks.map(
          (chunk) => chunk.chunkId,
        ),
        rerankedChunkIds: input.state.rerankedChunks.map(
          (chunk) => chunk.chunkId,
        ),
        citations: input.state.citations ?? [],

        answer: input.state.answer,
        verifierPassed: input.state.verification?.passed,
        verifierConfidence: input.state.verification?.confidence,
        verifierIssues: input.state.verification?.issues,

        latencyMs: input.latencyMs,
        nodeTimings: input.nodeTimings,
        workflowMetrics: {
          retrievalRetryCount: input.state.retrievalRetryCount,
          answerRetryCount: input.state.retryCount,
          citationRetryCount: input.state.citationRetryCount,
          citationCoverageMode: input.state.citationCoverage?.mode,
          citationCoverage: input.state.citationCoverage?.coverage,
          factualClaimCount: input.state.citationCoverage?.factualClaimCount,
          supportedClaimCount:
            input.state.citationCoverage?.supportedClaimCount,
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`[RagTrace] save failed: ${message}`);
    }
  }
}
