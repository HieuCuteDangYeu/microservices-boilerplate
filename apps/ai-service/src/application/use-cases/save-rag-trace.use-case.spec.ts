import type { RagChatWorkflowState } from '@ai/domain/interfaces/rag-chat-workflow.interface';
import { SaveRagTraceUseCase } from './save-rag-trace.use-case';

describe('SaveRagTraceUseCase', () => {
  it('persists bounded graph diagnostics under existing workflow metrics', async () => {
    const create = jest.fn().mockResolvedValue(undefined);
    const useCase = new SaveRagTraceUseCase({ create });
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
      failureDiagnostics: {
        failedNode: 'queryRouterNode',
        errorName: 'RouterUnavailableError',
        errorCode: 'ROUTER_UNAVAILABLE',
        causeCode: 'ROUTER_SEMANTIC_INCONSISTENT',
        semanticCalls: [
          {
            model: '@cf/test/router',
            providerStatus: 200,
            latencyMs: 10,
            configuredTimeoutMs: 30_000,
            configuredMaxCompletionTokens: 512,
            attempt: 1,
          },
        ],
      },
      route: {
        intent: 'REEL_VIDEO_QUESTION',
        referenceTarget: 'SHARED_REEL',
        needsRetrieval: true,
        needsUserMemory: false,
        needsConversationSummary: false,
        needsVerification: true,
        reelQuestionType: 'TRANSCRIPT_CONTENT',
        requiredEvidence: ['TRANSCRIPT'],
        recommendationAction: {
          type: 'NONE',
          reason: 'No recommendation needed.',
        },
        reason: 'The question asks about shared reel transcript content.',
        diagnostics: {
          modelRole: 'ROUTER',
          model: '@cf/test/router',
          providerStatus: 'SUCCESS',
          decisionSource: 'LLM',
        },
      },
      retrievalPlan: {
        diagnostics: {
          modelRole: 'RETRIEVAL_PLANNER',
          model: '@cf/test/planner',
          providerStatus: 'SUCCESS',
          decisionSource: 'LLM',
        },
      },
      answerClaims: [{ claim: 'answer', evidenceIds: ['e0'] }],
      contextSufficiency: {
        sufficient: true,
        confidence: 1,
        availableEvidence: ['TRANSCRIPT'],
        missingEvidence: [],
        reason: 'supported',
        recommendedAction: 'ANSWER',
        supportedEvidenceIds: ['e0'],
        diagnostics: {
          providerStatus: 'NOT_CALLED',
          decisionSource: 'LLM',
          modelRole: 'CONTEXT_SUFFICIENCY',
          model: '@cf/test/sufficiency',
        },
      },
      citationCoverage: {
        mode: 'LLM',
        coverage: 1,
        factualClaimCount: 1,
        supportedClaimCount: 1,
        unsupportedClaims: [],
        diagnostics: {
          decisionSource: 'LLM',
          selectedEvidenceIds: ['e0'],
          deterministicSupportingEvidenceIds: [],
          selectedEvidenceMappings: [
            {
              citationIndex: 0,
              selectedEvidenceId: 'e0',
              evidenceId: 'reel:r1:chunk:0',
            },
          ],
        },
      },
      verification: {
        passed: true,
        confidence: 1,
        issues: [],
        requiresRevision: false,
        supportedClaimMappings: [{ claim: 'answer', evidenceIds: ['e0'] }],
        contradictions: [],
        diagnostics: {
          providerStatus: 'ERROR',
          decisionSource: 'EXACT_PROVENANCE',
          finalPassed: true,
          confidence: 1,
          issues: [],
          requiresRevision: false,
          exactProvenance: {
            supported: true,
            supportingEvidenceIndexes: [0],
          },
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
          citationEvidenceIds: ['reel:r1:chunk:0'],
          citationSelectedEvidenceIds: ['e0'],
          deterministicSupportingEvidenceIds: [],
          citationEvidenceMappings: [
            {
              citationIndex: 0,
              selectedEvidenceId: 'e0',
              evidenceId: 'reel:r1:chunk:0',
            },
          ],
          diagnostics: expect.objectContaining({
            draftHistory: state.draftHistory,
            finalFailureSource: 'NO_CONTEXT',
            failure: state.failureDiagnostics,
            citationAttempts: state.citationAttempts,
            routeDecision: {
              intent: 'REEL_VIDEO_QUESTION',
              referenceTarget: 'SHARED_REEL',
              reelQuestionType: 'TRANSCRIPT_CONTENT',
              requiredEvidence: ['TRANSCRIPT'],
              needsRetrieval: true,
              needsVerification: true,
              recommendationActionType: 'NONE',
            },
            route: state.route?.diagnostics,
            retrievalPlan: state.retrievalPlan?.diagnostics,
            retrievalCounts: { retrieved: 0, reranked: 0 },
            answerClaims: state.answerClaims,
            contextSufficiency: expect.objectContaining({
              supportedEvidenceIds: ['e0'],
            }),
            verification: expect.objectContaining({
              supportedClaimMappings: [
                { claim: 'answer', evidenceIds: ['e0'] },
              ],
              contradictions: [],
            }),
          }),
        }),
      }),
    );
  });
});
