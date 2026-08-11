import type { RagChatWorkflowState } from '@ai/domain/interfaces/rag-chat-workflow.interface';
import { BuildRagCitationsUseCase } from './build-rag-citations.use-case';

describe('BuildRagCitationsUseCase', () => {
  const useCase = new BuildRagCitationsUseCase();

  it('quotes grounded evidence rather than enriched retrieval text', () => {
    const state: RagChatWorkflowState = {
      userId: 'user-1',
      conversationId: 'conversation-1',
      userMessage: 'What error is visible?',
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
    };

    expect(useCase.execute(state)).toEqual([
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
  });

  it('does not emit citations for insufficient context', () => {
    const state = {
      userId: 'user-1',
      conversationId: 'conversation-1',
      userMessage: 'What is visible?',
      retrievedChunks: [],
      rerankedChunks: [],
      route: {
        intent: 'REEL_VIDEO_QUESTION',
      },
      contextSufficiency: { sufficient: false },
      retryCount: 0,
      retrievalRetryCount: 0,
    } as RagChatWorkflowState;

    expect(useCase.execute(state)).toEqual([]);
  });
});
