import type { RagChatWorkflowState } from '@ai/domain/interfaces/rag-chat-workflow.interface';
import { SaveRagTraceUseCase } from './save-rag-trace.use-case';

describe('SaveRagTraceUseCase', () => {
  it('persists bounded graph diagnostics under existing workflow metrics', async () => {
    const create = jest.fn().mockResolvedValue(undefined);
    const useCase = new SaveRagTraceUseCase({ create } as never);
    const state = {
      userId: 'u',
      conversationId: 'c',
      userMessage: 'question',
      retrievedChunks: [],
      rerankedChunks: [],
      citations: [],
      retryCount: 1,
      retrievalRetryCount: 2,
      citationRetryCount: 1,
      draftHistory: [{ revision: 0, source: 'INITIAL', answer: 'answer' }],
      citationAttempts: [
        {
          attempt: 0,
          decisionSource: 'LLM',
          coverage: 1,
          selectedEvidenceIds: ['e0'],
          deterministicSupportingEvidenceIds: [],
        },
      ],
      nextDraftSource: 'INITIAL',
      finalFailureSource: 'NO_CONTEXT',
      contextSufficiency: {
        sufficient: true,
        confidence: 1,
        availableEvidence: ['TRANSCRIPT'],
        missingEvidence: [],
        reason: 'supported',
        recommendedAction: 'ANSWER',
        diagnostics: {
          providerStatus: 'NOT_CALLED',
          decisionSource: 'DETERMINISTIC_QUANTITY',
        },
      },
      verification: {
        passed: true,
        confidence: 1,
        issues: [],
        requiresRevision: false,
        diagnostics: {
          providerStatus: 'ERROR',
          decisionSource: 'DETERMINISTIC_DIRECT_SUPPORT',
          finalPassed: true,
          confidence: 1,
          issues: [],
          requiresRevision: false,
          directSupport: { supported: true, supportingEvidenceIndexes: [0] },
        },
      },
    } as unknown as RagChatWorkflowState;

    await useCase.execute({
      state,
      latencyMs: 5,
      nodeTimings: { draftAnswerNode: 1 },
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowMetrics: expect.objectContaining({
          retrievalRetryCount: 2,
          answerRetryCount: 1,
          citationRetryCount: 1,
          diagnostics: expect.objectContaining({
            draftHistory: state.draftHistory,
            finalFailureSource: 'NO_CONTEXT',
            citationAttempts: state.citationAttempts,
          }),
        }),
      }),
    );
  });
});
