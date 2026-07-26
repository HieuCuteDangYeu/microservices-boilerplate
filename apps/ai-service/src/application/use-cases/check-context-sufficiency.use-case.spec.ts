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
});
