import type { RagChatWorkflowState } from '@ai/domain/interfaces/rag-chat-workflow.interface';
import type { IStructuredLlmService } from '@ai/domain/interfaces/structured-llm.service.interface';
import { VerifierAgentUseCase } from './verifier-agent.use-case';

describe('VerifierAgentUseCase', () => {
  const transcriptState = (input: {
    question: string;
    answer: string;
    evidenceText: string;
  }) =>
    ({
      userMessage: input.question,
      answer: input.answer,
      rerankedChunks: [
        {
          evidenceType: 'TRANSCRIPT',
          evidenceText: input.evidenceText,
          chunkText: input.evidenceText,
          tags: [],
        },
      ],
      route: {
        intent: 'REEL_VIDEO_QUESTION',
        needsRetrieval: true,
        needsUserMemory: false,
        needsConversationSummary: false,
        needsVerification: true,
        reelQuestionType: 'TRANSCRIPT_CONTENT',
        requiredEvidence: ['TRANSCRIPT'],
        recommendationAction: { type: 'NONE', reason: 'none' },
        reason: 'transcript question',
      },
      retryCount: 0,
      retrievalRetryCount: 0,
      citationRetryCount: 0,
    }) as RagChatWorkflowState;

  it('fails closed when a route requires verification and the provider fails', async () => {
    const structuredLlmService: IStructuredLlmService = {
      generateObject: jest.fn().mockRejectedValue(new Error('provider down')),
    };
    const useCase = new VerifierAgentUseCase(structuredLlmService);
    const state = {
      userId: 'user-1',
      conversationId: 'conversation-1',
      userMessage: 'What is visible?',
      answer: 'The screen shows VLR-9281.',
      retrievedChunks: [],
      rerankedChunks: [],
      route: {
        intent: 'REEL_VIDEO_QUESTION',
        needsRetrieval: true,
        needsUserMemory: false,
        needsConversationSummary: false,
        needsVerification: true,
        reelQuestionType: 'VISUAL_CONTENT',
        requiredEvidence: ['VISUAL'],
        recommendationAction: { type: 'NONE', reason: 'none' },
        reason: 'visual question',
      },
      retryCount: 0,
      retrievalRetryCount: 0,
      citationRetryCount: 0,
    } as RagChatWorkflowState;

    await expect(useCase.execute(state)).resolves.toEqual({
      passed: false,
      confidence: 0,
      issues: ['Required answer verification was unavailable.'],
      requiresRevision: false,
    });
  });

  it('does not call the verifier for routes that do not require it', async () => {
    const structuredLlmService: IStructuredLlmService = {
      generateObject: jest.fn(),
    };
    const useCase = new VerifierAgentUseCase(structuredLlmService);
    const state = {
      route: { needsVerification: false },
    } as RagChatWorkflowState;

    await expect(useCase.execute(state)).resolves.toEqual({
      passed: true,
      confidence: 1,
      issues: [],
      requiresRevision: false,
    });
    expect(structuredLlmService.generateObject).not.toHaveBeenCalled();
  });

  it('uses the verifier-specific model and configured timeout for valid verification', async () => {
    const structuredLlmService: IStructuredLlmService = {
      generateObject: jest.fn().mockResolvedValue({
        passed: true,
        confidence: 0.9,
        issues: [],
        requiresRevision: false,
        revisedInstruction: '',
      }),
    };
    const config = {
      get: jest.fn((key: string) =>
        key === 'CLOUDFLARE_VERIFIER_MODEL'
          ? '@cf/test/verifier'
          : key === 'AI_RAG_VERIFIER_TIMEOUT_MS'
            ? '9000'
            : undefined,
      ),
    };
    const useCase = new VerifierAgentUseCase(
      structuredLlmService,
      config as never,
    );
    const state = {
      route: {
        intent: 'REEL_VIDEO_QUESTION',
        needsRetrieval: true,
        needsUserMemory: false,
        needsConversationSummary: false,
        needsVerification: true,
        reelQuestionType: 'VISUAL_CONTENT',
        requiredEvidence: ['VISUAL'],
        recommendationAction: { type: 'NONE', reason: 'none' },
        reason: 'visual question',
      },
      rerankedChunks: [],
    } as RagChatWorkflowState;

    await expect(useCase.execute(state)).resolves.toMatchObject({
      passed: true,
      confidence: 0.9,
      requiresRevision: false,
    });
    expect(structuredLlmService.generateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        model: '@cf/test/verifier',
        timeoutMs: 9000,
      }),
    );
  });

  it('instructs the verifier not to require timestamps for direct visual facts', () => {
    const useCase = new VerifierAgentUseCase({
      generateObject: jest.fn(),
    } as never);
    const systemPrompt = (
      useCase as unknown as { buildSystemPrompt: () => string }
    ).buildSystemPrompt();

    expect(systemPrompt).toContain(
      'does not need to repeat the evidence timestamp',
    );
  });

  it.each([
    [
      'Who is the shot detector being presented to?',
      'Olivier.',
      'The shot detector is being presented to Olivier.',
    ],
    [
      'What example label is used for a marble in a bag?',
      'Blue.',
      'The marble put in the bag is assigned the blue label.',
    ],
    [
      'How many frequency bands is the speaker currently using?',
      'Fifteen frequency bands.',
      'What I am using are 15 frequency bands.',
    ],
  ])(
    'keeps a compact directly supported transcript fact when the LLM rejects it',
    async (question, answer, evidenceText) => {
      const structuredLlmService: IStructuredLlmService = {
        generateObject: jest.fn().mockResolvedValue({
          passed: false,
          confidence: 1,
          issues: ['Incorrectly conservative provider judgment.'],
          requiresRevision: true,
          revisedInstruction: 'Rewrite it.',
        }),
      };
      const useCase = new VerifierAgentUseCase(structuredLlmService);

      await expect(
        useCase.execute(transcriptState({ question, answer, evidenceText })),
      ).resolves.toMatchObject({
        passed: true,
        confidence: 1,
        requiresRevision: false,
      });
    },
  );

  it('does not override an LLM rejection for topic-only transcript overlap', async () => {
    const structuredLlmService: IStructuredLlmService = {
      generateObject: jest.fn().mockResolvedValue({
        passed: false,
        confidence: 0.9,
        issues: ['The requested label is absent.'],
        requiresRevision: true,
        revisedInstruction: 'Do not infer a label.',
      }),
    };
    const useCase = new VerifierAgentUseCase(structuredLlmService);

    await expect(
      useCase.execute(
        transcriptState({
          question: 'What label is assigned to the marble in the bag?',
          answer: 'Blue.',
          evidenceText: 'A blue marble is beside a bag.',
        }),
      ),
    ).resolves.toMatchObject({ passed: false, requiresRevision: true });
  });

  it('asks the LLM verifier to reject a supported fact that answers the wrong slot', () => {
    const useCase = new VerifierAgentUseCase({
      generateObject: jest.fn(),
    } as never);
    const systemPrompt = (
      useCase as unknown as { buildSystemPrompt: () => string }
    ).buildSystemPrompt();

    expect(systemPrompt).toContain('wrong answer');
    expect(systemPrompt).toContain('nearby count');
  });
});
