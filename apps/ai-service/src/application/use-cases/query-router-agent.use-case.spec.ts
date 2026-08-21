import { QueryRouterAgentUseCase } from './query-router-agent.use-case';

describe('QueryRouterAgentUseCase', () => {
  const normalRouterResponse = {
    intent: 'NORMAL_CHAT',
    needsRetrieval: false,
    needsUserMemory: false,
    needsConversationSummary: false,
    needsVerification: false,
    reelQuestionType: 'NONE',
    requiredEvidence: ['NONE'],
    recommendationAction: { type: 'NONE' },
  };

  it('forces transcript retrieval for an explicit shared media question', async () => {
    const structuredLlmService = {
      generateObject: jest.fn().mockResolvedValue(normalRouterResponse),
    };
    const useCase = new QueryRouterAgentUseCase(structuredLlmService as never);

    await expect(
      useCase.execute({
        message:
          'What does the shared long-form canary say about timestamp citations?',
        hasSharedReelContext: true,
      }),
    ).resolves.toMatchObject({
      intent: 'REEL_VIDEO_QUESTION',
      reelQuestionType: 'TRANSCRIPT_CONTENT',
      needsRetrieval: true,
      requiredEvidence: ['TRANSCRIPT'],
      recommendationAction: { type: 'NONE' },
    });
  });

  it.each([
    ['What order number is visible?', 'VISUAL_CONTENT', ['VISUAL']],
    ['What discount is visible?', 'VISUAL_CONTENT', ['VISUAL']],
    ['What does it say on screen?', 'VISUAL_CONTENT', ['VISUAL']],
    [
      'What project name does the speaker say?',
      'TRANSCRIPT_CONTENT',
      ['TRANSCRIPT'],
    ],
    [
      'What is this reel about?',
      'GENERAL_REEL_SUMMARY',
      ['TRANSCRIPT', 'METADATA'],
    ],
  ])(
    'routes a bare shared-reel question with the required evidence: %s',
    async (message, reelQuestionType, requiredEvidence) => {
      const structuredLlmService = {
        generateObject: jest.fn().mockResolvedValue(normalRouterResponse),
      };
      const useCase = new QueryRouterAgentUseCase(
        structuredLlmService as never,
      );

      await expect(
        useCase.execute({ message, hasSharedReelContext: true }),
      ).resolves.toMatchObject({
        intent: 'REEL_VIDEO_QUESTION',
        reelQuestionType,
        requiredEvidence,
        needsRetrieval: true,
      });
    },
  );

  it.each([
    'Who is the video shot detector being presented to?',
    'Where was the video shot detector project carried out, and under whose supervision?',
    'What safety measure do they say protects data if a building has a fire?',
    'Why do they say CDs are not enough for backing up data?',
    'In the marble example, what does someone tell the algorithm about two marbles?',
    'What example label is used for a marble that is put into a bag?',
    'How many frequency bands is the speaker currently using?',
    'How low does the speaker say the number of bands can go while still being okay?',
    'Which person is mentioned in the discussion?',
  ])(
    'routes standalone factual shared-reel questions to transcript retrieval: %s',
    async (message) => {
      const structuredLlmService = {
        generateObject: jest.fn().mockResolvedValue(normalRouterResponse),
      };
      const useCase = new QueryRouterAgentUseCase(
        structuredLlmService as never,
      );

      await expect(
        useCase.execute({
          message,
          hasSharedReelContext: true,
          sharedReelCount: 4,
        }),
      ).resolves.toMatchObject({
        intent: 'REEL_VIDEO_QUESTION',
        reelQuestionType: 'TRANSCRIPT_CONTENT',
        requiredEvidence: ['TRANSCRIPT'],
        needsRetrieval: true,
      });
    },
  );

  it('does not convert a bare visual question without shared reel access', async () => {
    const structuredLlmService = {
      generateObject: jest.fn().mockResolvedValue(normalRouterResponse),
    };
    const useCase = new QueryRouterAgentUseCase(structuredLlmService as never);

    await expect(
      useCase.execute({
        message: 'What order number is visible?',
        hasSharedReelContext: false,
      }),
    ).resolves.toMatchObject({
      intent: 'NORMAL_CHAT',
      reelQuestionType: 'NONE',
      needsRetrieval: false,
    });
  });

  it('keeps ordinary chat as normal chat even when reel context exists', async () => {
    const structuredLlmService = {
      generateObject: jest.fn().mockResolvedValue(normalRouterResponse),
    };
    const useCase = new QueryRouterAgentUseCase(structuredLlmService as never);

    await expect(
      useCase.execute({
        message: 'Can you explain dependency injection?',
        hasSharedReelContext: true,
      }),
    ).resolves.toMatchObject({
      intent: 'NORMAL_CHAT',
      needsRetrieval: false,
    });
  });

  it.each([
    'hello',
    'write me a TypeScript debounce function',
    'what is the capital of Japan?',
    'help me debug my Dockerfile',
    'remember that I prefer dark mode',
    'recommend me some fitness reels',
  ])('keeps unrelated chat normal with shared reels: %s', async (message) => {
    const structuredLlmService = {
      generateObject: jest.fn().mockResolvedValue(normalRouterResponse),
    };
    const useCase = new QueryRouterAgentUseCase(structuredLlmService as never);

    await expect(
      useCase.execute({
        message,
        hasSharedReelContext: true,
        sharedReelCount: 4,
      }),
    ).resolves.toMatchObject({
      intent: 'NORMAL_CHAT',
      needsRetrieval: false,
      reelQuestionType: 'NONE',
    });
  });
});
