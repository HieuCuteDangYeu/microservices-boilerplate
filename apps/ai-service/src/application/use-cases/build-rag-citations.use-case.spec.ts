import type { ICitationAttributionService } from '@ai/domain/interfaces/citation-attribution.service.interface';
import type { RagChatWorkflowState } from '@ai/domain/interfaces/rag-chat-workflow.interface';
import { BuildRagCitationsUseCase } from './build-rag-citations.use-case';

describe('BuildRagCitationsUseCase', () => {
  const buildState = (): RagChatWorkflowState => ({
    userId: 'user-1',
    conversationId: 'conversation-1',
    userMessage: 'What error is visible?',
    answer: 'The visible error says Cannot find module @nestjs/config.',
    retrievedChunks: [],
    rerankedChunks: [
      {
        chunkId: 'reel:r1:visual:0',
        reelId: 'r1',
        title: 'Debugging demo',
        tags: ['nestjs'],
        chunkText: 'Visible text: Cannot find module @nestjs/config',
        retrievalText:
          'Document type: Visual scene\nReel title: Debugging demo\nGrounded visual evidence: Visible text: Cannot find module @nestjs/config',
        evidenceText: 'Visible text: Cannot find module @nestjs/config',
        evidenceType: 'VISUAL',
        startTime: 12.4,
        endTime: 12.4,
        distance: 0.08,
        score: 0.03,
      },
    ],
    route: {
      intent: 'REEL_VIDEO_QUESTION',
      needsRetrieval: true,
      needsUserMemory: false,
      needsConversationSummary: false,
      needsVerification: true,
      reelQuestionType: 'VISUAL_CONTENT',
      requiredEvidence: ['VISUAL'],
      recommendationAction: {
        type: 'NONE',
        reason: 'No recommendation needed.',
      },
      reason: 'The question asks about visible reel content.',
    },
    contextSufficiency: {
      sufficient: true,
      confidence: 1,
      availableEvidence: ['VISUAL'],
      missingEvidence: [],
      reason: 'Grounded visual evidence is available.',
      recommendedAction: 'ANSWER',
    },
    retryCount: 0,
    retrievalRetryCount: 0,
    citationRetryCount: 0,
  });

  it('uses LLM-selected evidence but quotes only grounded evidence text', async () => {
    const attributionService: ICitationAttributionService = {
      attribute: jest.fn().mockResolvedValue({
        selections: [{ evidenceId: 'e0', confidence: 0.98 }],
        claims: [
          {
            claim: 'The visible error says Cannot find module @nestjs/config.',
            supported: true,
            evidenceIds: ['e0'],
            confidence: 0.98,
          },
        ],
        factualClaimCount: 1,
        supportedClaimCount: 1,
        coverage: 1,
      }),
    };
    const useCase = new BuildRagCitationsUseCase(attributionService);

    const assessment = await useCase.execute(buildState());
    expect(assessment.citations).toEqual([
      {
        sourceType: 'REEL',
        reelId: 'r1',
        evidenceType: 'VISUAL',
        title: 'Debugging demo',
        startTime: 12.4,
        endTime: 12.4,
        quote: 'Visible text: Cannot find module @nestjs/config',
      },
    ]);
    expect(assessment.coverage).toEqual(
      expect.objectContaining({
        mode: 'LLM',
        coverage: 1,
        factualClaimCount: 1,
        supportedClaimCount: 1,
      }),
    );
  });

  it('reports unsupported claims instead of inventing citations', async () => {
    const attributionService: ICitationAttributionService = {
      attribute: jest.fn().mockResolvedValue({
        selections: [],
        claims: [
          {
            claim: 'The error is caused by a missing production dependency.',
            supported: false,
            evidenceIds: [],
            confidence: 0.95,
          },
        ],
        factualClaimCount: 1,
        supportedClaimCount: 0,
        coverage: 0,
      }),
    };
    const useCase = new BuildRagCitationsUseCase(attributionService);

    const assessment = await useCase.execute(buildState());
    expect(assessment.citations).toEqual([]);
    expect(assessment.coverage.unsupportedClaims).toEqual([
      'The error is caused by a missing production dependency.',
    ]);
  });

  it('falls back to grounded rerank order when attribution provider fails', async () => {
    const attributionService: ICitationAttributionService = {
      attribute: jest.fn().mockRejectedValue(new Error('provider unavailable')),
    };
    const useCase = new BuildRagCitationsUseCase(attributionService);

    const assessment = await useCase.execute(buildState());
    expect(assessment.citations).toEqual([
      expect.objectContaining({
        reelId: 'r1',
        evidenceType: 'VISUAL',
        quote: 'Visible text: Cannot find module @nestjs/config',
      }),
    ]);
    expect(assessment.coverage.mode).toBe('FALLBACK');
  });

  it('does not emit citations for insufficient context', async () => {
    const attributionService: ICitationAttributionService = {
      attribute: jest.fn(),
    };
    const useCase = new BuildRagCitationsUseCase(attributionService);
    const state = {
      ...buildState(),
      contextSufficiency: { sufficient: false },
    } as RagChatWorkflowState;

    await expect(useCase.execute(state)).resolves.toEqual({
      citations: [],
      coverage: {
        mode: 'NOT_REQUIRED',
        coverage: 1,
        factualClaimCount: 0,
        supportedClaimCount: 0,
        unsupportedClaims: [],
      },
    });
    expect(attributionService.attribute).not.toHaveBeenCalled();
  });
});
