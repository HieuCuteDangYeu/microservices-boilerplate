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
      diagnostics: { providerStatus: 'SUCCESS', decisionSource: 'LLM' },
    });
  });

  it.each([
    'How many bands is the speaker using?',
    'What number of bands does the speaker say they are using?',
  ])(
    'answers when transcript evidence explicitly supports a quantity: %s',
    async (userMessage) => {
      const structuredLlmService = {
        generateObject: jest.fn().mockResolvedValue({
          sufficient: false,
          confidence: 0.1,
          availableEvidence: ['TRANSCRIPT'],
          missingEvidence: ['TRANSCRIPT'],
          reason: 'Conservative refusal.',
          userFacingReason: 'Missing evidence.',
          recommendedAction: 'REFUSE_NO_CONTEXT',
        }),
      };
      const useCase = new CheckContextSufficiencyUseCase(
        structuredLlmService as never,
      );
      const state = {
        userMessage,
        route: {
          intent: 'REEL_VIDEO_QUESTION',
          needsRetrieval: true,
          requiredEvidence: ['TRANSCRIPT'],
        },
        rerankedChunks: [
          {
            evidenceType: 'TRANSCRIPT',
            evidenceText: "The speaker says, 'what I am using are 15 bands.'",
            chunkText: "The speaker says, 'what I am using are 15 bands.'",
            tags: [],
          },
        ],
      } as RagChatWorkflowState;

      await expect(useCase.execute(state)).resolves.toMatchObject({
        sufficient: true,
        recommendedAction: 'ANSWER',
        diagnostics: {
          providerStatus: 'NOT_CALLED',
          decisionSource: 'DETERMINISTIC_QUANTITY',
        },
      });
      expect(structuredLlmService.generateObject).not.toHaveBeenCalled();
    },
  );

  it('does not reject the IN1001-2 supporting transcript for absent conversation memory', async () => {
    const structuredLlmService = {
      generateObject: jest.fn().mockResolvedValue({
        sufficient: true,
        confidence: 1,
        availableEvidence: ['TRANSCRIPT'],
        missingEvidence: [],
        reason: 'The transcript directly states the internship and supervisor.',
        userFacingReason: '',
        recommendedAction: 'ANSWER',
      }),
    };
    const useCase = new CheckContextSufficiencyUseCase(
      structuredLlmService as never,
    );

    await expect(
      useCase.execute({
        userMessage:
          'Where was the video shot detector project carried out, and under whose supervision?',
        route: {
          intent: 'REEL_VIDEO_QUESTION',
          needsRetrieval: true,
          requiredEvidence: ['TRANSCRIPT'],
        },
        rerankedChunks: [
          {
            evidenceType: 'TRANSCRIPT',
            evidenceText:
              'It was my project during my internship at IDIAP under the supervision of Jean-Marc.',
            chunkText:
              'It was my project during my internship at IDIAP under the supervision of Jean-Marc.',
            tags: [],
          },
        ],
      } as RagChatWorkflowState),
    ).resolves.toMatchObject({
      sufficient: true,
      recommendedAction: 'ANSWER',
      missingEvidence: [],
    });
    expect(structuredLlmService.generateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        userPrompt: expect.stringContaining(
          '"requiredEvidence":["TRANSCRIPT"]',
        ),
      }),
    );
  });

  it.each([
    [
      'What relation makes the two items belong to the same cluster?',
      'The two items share a salient feature in common, so they belong to the same cluster.',
    ],
    [
      'What label is assigned to the item in the bag?',
      'The bag is assigned the blue label after the item is placed inside.',
    ],
  ])(
    'answers a directly supported transcript fact: %s',
    async (userMessage, evidenceText) => {
      const structuredLlmService = {
        generateObject: jest.fn().mockResolvedValue({
          sufficient: false,
          confidence: 0.1,
          availableEvidence: ['TRANSCRIPT'],
          missingEvidence: ['TRANSCRIPT'],
          reason: 'Conservative refusal.',
          userFacingReason: 'Missing evidence.',
          recommendedAction: 'REFUSE_NO_CONTEXT',
        }),
      };
      const useCase = new CheckContextSufficiencyUseCase(
        structuredLlmService as never,
      );
      const state = {
        userMessage,
        route: {
          intent: 'REEL_VIDEO_QUESTION',
          needsRetrieval: true,
          requiredEvidence: ['TRANSCRIPT'],
        },
        rerankedChunks: [
          {
            evidenceType: 'TRANSCRIPT',
            evidenceText,
            chunkText: evidenceText,
            tags: [],
          },
        ],
      } as RagChatWorkflowState;

      await expect(useCase.execute(state)).resolves.toMatchObject({
        sufficient: true,
        recommendedAction: 'ANSWER',
        diagnostics: {
          providerStatus: 'NOT_CALLED',
          decisionSource: 'DETERMINISTIC_DIRECT_FACT',
        },
      });
      expect(structuredLlmService.generateObject).not.toHaveBeenCalled();
    },
  );

  it('does not treat topic-only transcript overlap as direct factual support', async () => {
    const structuredLlmService = {
      generateObject: jest.fn().mockResolvedValue({
        sufficient: false,
        confidence: 0.2,
        availableEvidence: ['TRANSCRIPT'],
        missingEvidence: ['TRANSCRIPT'],
        reason: 'Only a topic match is present.',
        userFacingReason: 'Missing evidence.',
        recommendedAction: 'REFUSE_NO_CONTEXT',
      }),
    };
    const useCase = new CheckContextSufficiencyUseCase(
      structuredLlmService as never,
    );
    const state = {
      userMessage: 'What label is assigned to the item in the bag?',
      route: {
        intent: 'REEL_VIDEO_QUESTION',
        needsRetrieval: true,
        requiredEvidence: ['TRANSCRIPT'],
      },
      rerankedChunks: [
        {
          evidenceType: 'TRANSCRIPT',
          evidenceText: 'A blue item is beside a bag.',
          chunkText: 'A blue item is beside a bag.',
          tags: [],
        },
      ],
    } as RagChatWorkflowState;

    await expect(useCase.execute(state)).resolves.toMatchObject({
      sufficient: false,
      recommendedAction: 'REFUSE_NO_CONTEXT',
    });
    expect(structuredLlmService.generateObject).toHaveBeenCalledTimes(1);
  });

  it('records provider fallback provenance after an LLM error', async () => {
    const structuredLlmService = {
      generateObject: jest.fn().mockRejectedValue(new Error('down')),
    };
    const useCase = new CheckContextSufficiencyUseCase(
      structuredLlmService as never,
    );
    await expect(
      useCase.execute({
        userMessage: 'What does the speaker say?',
        route: {
          intent: 'REEL_VIDEO_QUESTION',
          needsRetrieval: true,
          requiredEvidence: ['TRANSCRIPT'],
        },
        rerankedChunks: [
          {
            evidenceType: 'TRANSCRIPT',
            evidenceText: 'The speaker says hello.',
            chunkText: 'The speaker says hello.',
            tags: [],
          },
        ],
      } as RagChatWorkflowState),
    ).resolves.toMatchObject({
      sufficient: true,
      recommendedAction: 'ANSWER',
      diagnostics: {
        providerStatus: 'ERROR',
        decisionSource: 'PROVIDER_FALLBACK',
      },
    });
  });
});
