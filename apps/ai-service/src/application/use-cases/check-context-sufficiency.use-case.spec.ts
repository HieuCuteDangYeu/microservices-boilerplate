import type { RagChatWorkflowState } from '@ai/domain/interfaces/rag-chat-workflow.interface';
import { CheckContextSufficiencyUseCase } from './check-context-sufficiency.use-case';

describe('CheckContextSufficiencyUseCase', () => {
  it('refuses an explicit missing transcript mention before generation', async () => {
    const structuredLlmService = { generateObject: jest.fn() };
    const useCase = new CheckContextSufficiencyUseCase(
      structuredLlmService as never,
    );
    const state = {
      userMessage:
        'Does the shared long-form canary mention quantum entanglement?',
      route: {
        intent: 'REEL_VIDEO_QUESTION',
        needsRetrieval: true,
        requiredEvidence: ['TRANSCRIPT'],
      },
      rerankedChunks: [
        {
          chunkText: 'The canary mentions timestamp citations.',
          tags: [],
        },
      ],
    } as RagChatWorkflowState;

    await expect(useCase.execute(state)).resolves.toMatchObject({
      sufficient: false,
      missingEvidence: ['TRANSCRIPT'],
      recommendedAction: 'REFUSE_NO_CONTEXT',
    });
    expect(structuredLlmService.generateObject).not.toHaveBeenCalled();
  });

  it('uses the provider sufficiency decision when its action is contradictory', async () => {
    const structuredLlmService = {
      generateObject: jest.fn().mockResolvedValue({
        sufficient: true,
        confidence: 0.9,
        availableEvidence: ['VISUAL'],
        missingEvidence: [],
        reason: 'The sampled frame directly supports the answer.',
        userFacingReason: '',
        recommendedAction: 'REFUSE_NO_CONTEXT',
      }),
    };
    const useCase = new CheckContextSufficiencyUseCase(
      structuredLlmService as never,
    );
    const state = {
      userMessage: 'What order number is visible?',
      route: {
        intent: 'REEL_VIDEO_QUESTION',
        needsRetrieval: true,
        requiredEvidence: ['VISUAL'],
      },
      rerankedChunks: [
        {
          evidenceType: 'VISUAL',
          evidenceText: 'ORDER NUMBER: VLR-9281',
          chunkText: 'ORDER NUMBER: VLR-9281',
          tags: [],
        },
      ],
    } as RagChatWorkflowState;

    await expect(useCase.execute(state)).resolves.toMatchObject({
      sufficient: true,
      recommendedAction: 'ANSWER',
    });
  });
});
