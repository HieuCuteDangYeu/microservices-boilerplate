import type { RagChatWorkflowState } from '@ai/domain/interfaces/rag-chat-workflow.interface';
import { BuildGroundedAnswerRevisionUseCase } from './build-grounded-answer-revision.use-case';

describe('BuildGroundedAnswerRevisionUseCase', () => {
  const useCase = new BuildGroundedAnswerRevisionUseCase();
  const state = (input: {
    question: string;
    evidenceText: string;
    evidenceType?: 'TRANSCRIPT' | 'VISUAL';
  }) =>
    ({
      userId: 'user-1',
      conversationId: 'conversation-1',
      userMessage: input.question,
      route: { intent: 'REEL_VIDEO_QUESTION' },
      verification: {
        passed: false,
        confidence: 1,
        issues: ['Directly reference the provided evidence.'],
        requiresRevision: true,
      },
      nextDraftSource: 'VERIFIER_REVISION',
      rerankedChunks: [
        {
          evidenceType: input.evidenceType ?? 'TRANSCRIPT',
          evidenceText: input.evidenceText,
          chunkText: input.evidenceText,
          tags: [],
        },
      ],
      retrievedChunks: [],
      retryCount: 0,
      retrievalRetryCount: 0,
      citationRetryCount: 0,
      draftHistory: [],
      draftRevision: 1,
      citationAttempts: [],
      finalFailureSource: 'UNKNOWN',
    }) as RagChatWorkflowState;

  it('extracts a directly supported explanatory fact from the real evidence shape', () => {
    const revision = useCase.execute(
      state({
        question: 'Why do they say CDs are not enough for backing up data?',
        evidenceText:
          'The conclusion is to have a backup on the CD at home. CDs are not enough because one CD is not even one GB. Then CDs are not enough.',
      }),
    );

    expect(revision).toContain('one CD is not even one GB');
  });

  it.each([
    [
      'What safety measure protects data if a building has a fire?',
      'We have three backups. The backups are stored in different physical locations.',
    ],
    ['Why are CDs not enough for backups?', 'We use CDs for backups.'],
    ['Why are CDs not enough for backups?', 'We have three CDs.'],
    [
      'Why are CDs not enough for backups?',
      'CDs fail in fires and are under one GB.',
    ],
    ['Why are CDs not enough for backups?', 'Each CD holds ten GB.'],
  ])(
    'fails closed for an unsafe evidence candidate',
    (question, evidenceText) => {
      expect(
        useCase.execute(state({ question, evidenceText })),
      ).toBeUndefined();
    },
  );

  it('does not extract transcript text for a visual question', () => {
    expect(
      useCase.execute(
        state({
          question: 'What color is the CD shown on screen?',
          evidenceText: 'One CD is not even one GB.',
        }),
      ),
    ).toBeUndefined();
  });

  it('fails closed when non-overlapping supported spans give conflicting quantities', () => {
    expect(
      useCase.execute(
        state({
          question: 'How many bands are currently used?',
          evidenceText:
            'Earlier it was twelve bands. We currently use fifteen bands.',
        }),
      ),
    ).toBeUndefined();
  });

  it('runs only for a verifier revision', () => {
    const input = state({
      question: 'Why are CDs not enough for backups?',
      evidenceText: 'CDs are not enough because one CD is not even one GB.',
    });
    input.nextDraftSource = 'INITIAL';

    expect(useCase.execute(input)).toBeUndefined();
  });
});
