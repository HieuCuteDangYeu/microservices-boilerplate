import { QueryRouterAgentUseCase } from './query-router-agent.use-case';

describe('QueryRouterAgentUseCase', () => {
  it('forces transcript retrieval for an explicit shared media question', async () => {
    const structuredLlmService = {
      generateObject: jest.fn().mockResolvedValue({
        intent: 'NORMAL_CHAT',
        needsRetrieval: false,
        needsUserMemory: false,
        needsConversationSummary: false,
        needsVerification: false,
        reelQuestionType: 'NONE',
        requiredEvidence: ['NONE'],
        recommendationAction: { type: 'RECOMMEND_REELS' },
      }),
    };
    const useCase = new QueryRouterAgentUseCase(structuredLlmService as never);

    await expect(
      useCase.execute({
        message:
          'What does the shared long-form canary say about timestamp citations?',
      }),
    ).resolves.toMatchObject({
      intent: 'REEL_VIDEO_QUESTION',
      reelQuestionType: 'TRANSCRIPT_CONTENT',
      needsRetrieval: true,
      requiredEvidence: ['TRANSCRIPT'],
      recommendationAction: { type: 'NONE' },
    });
  });
});
