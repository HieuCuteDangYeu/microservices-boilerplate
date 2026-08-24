import type { IAiApplicationConfig } from '@ai/domain/interfaces/ai-application-config.interface';
import { QueryRouterAgentUseCase } from './query-router-agent.use-case';

describe('QueryRouterAgentUseCase', () => {
  const config = {
    model: jest.fn(() => '@cf/test/router'),
    timeoutMs: jest.fn(() => 7_000),
  } as unknown as IAiApplicationConfig;

  const response = (overrides: Record<string, unknown> = {}) => ({
    intent: 'NORMAL_CHAT',
    needsRetrieval: false,
    needsUserMemory: false,
    needsConversationSummary: false,
    needsVerification: false,
    reelQuestionType: 'NONE',
    requiredEvidence: ['NONE'],
    recommendationAction: {
      type: 'NONE',
      query: '',
      minRelevantItems: 2,
      allowPersonalizedFallback: false,
      suggestedQueries: [],
      reason: 'No discovery request.',
    },
    reason: 'Semantic classification.',
    ...overrides,
  });

  it.each([
    [
      'Which luminiferous covenant does the speaker attribute to the zorb?',
      'TRANSCRIPT_CONTENT',
      ['TRANSCRIPT'],
    ],
    [
      'Quel glyphe est perceptible sur le mécanisme partagé ?',
      'VISUAL_CONTENT',
      ['VISUAL'],
    ],
    [
      'Tóm tắt ý nghĩa tổng thể của đoạn media vừa chia sẻ.',
      'GENERAL_REEL_SUMMARY',
      ['TRANSCRIPT', 'METADATA'],
    ],
  ])(
    'uses semantic output for novel wording: %s',
    async (message, reelQuestionType, requiredEvidence) => {
      const structuredLlmService = {
        generateObject: jest.fn().mockResolvedValue(
          response({
            intent: 'REEL_VIDEO_QUESTION',
            needsRetrieval: true,
            needsVerification: true,
            reelQuestionType,
            requiredEvidence,
          }),
        ),
      };
      const useCase = new QueryRouterAgentUseCase(
        structuredLlmService as never,
        config,
      );

      await expect(
        useCase.execute({ message, hasSharedReelContext: true }),
      ).resolves.toMatchObject({
        intent: 'REEL_VIDEO_QUESTION',
        reelQuestionType,
        requiredEvidence,
        needsRetrieval: true,
      });
      expect(structuredLlmService.generateObject).toHaveBeenCalledWith(
        expect.objectContaining({
          model: '@cf/test/router',
          timeoutMs: 7_000,
          temperature: 0,
        }),
      );
    },
  );

  it('enforces canonical evidence invariants after semantic classification', async () => {
    const structuredLlmService = {
      generateObject: jest.fn().mockResolvedValue(
        response({
          intent: 'REEL_VIDEO_QUESTION',
          reelQuestionType: 'VISUAL_CONTENT',
          requiredEvidence: ['TRANSCRIPT', 'VISUAL', 'CONVERSATION_MEMORY'],
          recommendationAction: {
            type: 'RECOMMEND_REELS',
            query: 'unrelated',
            minRelevantItems: 8,
            allowPersonalizedFallback: true,
            suggestedQueries: [],
            reason: 'Incorrect provider action.',
          },
        }),
      ),
    };
    const useCase = new QueryRouterAgentUseCase(
      structuredLlmService as never,
      config,
    );

    await expect(
      useCase.execute({ message: 'Inspect the shared medium.' }),
    ).resolves.toMatchObject({
      requiredEvidence: ['VISUAL'],
      recommendationAction: { type: 'NONE' },
    });
  });

  it.each([
    ['CONVERSATION_MEMORY_QUESTION', ['CONVERSATION_MEMORY']],
    ['USER_MEMORY_QUESTION', ['USER_MEMORY']],
  ])('enforces canonical evidence for %s', async (intent, requiredEvidence) => {
    const structuredLlmService = {
      generateObject: jest.fn().mockResolvedValue(
        response({
          intent,
          requiredEvidence: ['TRANSCRIPT', 'USER_MEMORY'],
        }),
      ),
    };
    const useCase = new QueryRouterAgentUseCase(
      structuredLlmService as never,
      config,
    );

    await expect(
      useCase.execute({ message: 'Recall context.' }),
    ).resolves.toMatchObject({ intent, requiredEvidence });
  });

  it('keeps unrelated chat normal even when reel context exists', async () => {
    const structuredLlmService = {
      generateObject: jest.fn().mockResolvedValue(response()),
    };
    const useCase = new QueryRouterAgentUseCase(
      structuredLlmService as never,
      config,
    );

    await expect(
      useCase.execute({
        message: 'Explain dependency injection.',
        hasSharedReelContext: true,
      }),
    ).resolves.toMatchObject({
      intent: 'NORMAL_CHAT',
      needsRetrieval: false,
      reelQuestionType: 'NONE',
    });
  });

  it('fails safely to normal chat when semantic routing is unavailable', async () => {
    const useCase = new QueryRouterAgentUseCase(
      {
        generateObject: jest.fn().mockRejectedValue(new Error('provider down')),
      } as never,
      config,
    );

    await expect(
      useCase.execute({ message: 'Novel shared-media question.' }),
    ).resolves.toMatchObject({
      intent: 'NORMAL_CHAT',
      needsRetrieval: false,
      needsVerification: false,
    });
  });
});
