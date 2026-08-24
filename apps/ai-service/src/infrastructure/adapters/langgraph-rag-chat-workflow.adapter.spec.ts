import type { RagChatWorkflowState } from '@ai/domain/interfaces/rag-chat-workflow.interface';
import { LangGraphRagChatWorkflowAdapter } from './langgraph-rag-chat-workflow.adapter';

describe('LangGraphRagChatWorkflowAdapter routing', () => {
  const workflow = new LangGraphRagChatWorkflowAdapter(
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    { get: jest.fn() } as never,
    undefined as never,
  );
  const routeAfterVerifier = workflow as unknown as {
    routeAfterVerifier: (state: RagChatWorkflowState) => string;
    routeAfterCitationCoverage: (state: RagChatWorkflowState) => string;
    createPrepareAnswerRevisionNode: () => (
      state: RagChatWorkflowState,
    ) => Partial<RagChatWorkflowState>;
    createPrepareCitationRevisionNode: () => (
      state: RagChatWorkflowState,
    ) => Partial<RagChatWorkflowState>;
    createVerificationFailureNode: () => (
      state: RagChatWorkflowState,
    ) => Partial<RagChatWorkflowState>;
  };
  const state = (overrides: Partial<RagChatWorkflowState> = {}) =>
    ({
      userId: 'user-1',
      conversationId: 'conversation-1',
      userMessage: 'What is the answer?',
      retrievedChunks: [],
      rerankedChunks: [],
      retryCount: 0,
      retrievalRetryCount: 0,
      citationRetryCount: 0,
      ...overrides,
    }) as RagChatWorkflowState;

  it('routes a verified answer to citation attribution', () => {
    expect(
      routeAfterVerifier.routeAfterVerifier(
        state({
          verification: {
            passed: true,
            confidence: 1,
            issues: [],
            requiresRevision: false,
          },
        }),
      ),
    ).toBe('citationNode');
  });

  it('routes a revisable verifier failure to answer revision', () => {
    expect(
      routeAfterVerifier.routeAfterVerifier(
        state({
          verification: {
            passed: false,
            confidence: 0,
            issues: [],
            requiresRevision: true,
          },
        }),
      ),
    ).toBe('prepareAnswerRevisionNode');
  });

  it('routes an exhausted verifier failure to the generic refusal', () => {
    expect(
      routeAfterVerifier.routeAfterVerifier(
        state({
          retryCount: 1,
          verification: {
            passed: false,
            confidence: 0,
            issues: [],
            requiresRevision: true,
          },
        }),
      ),
    ).toBe('verificationFailureNode');
  });

  it('routes a fully covered LLM attribution to the final answer', () => {
    expect(
      routeAfterVerifier.routeAfterCitationCoverage(
        state({
          citationCoverage: {
            mode: 'LLM',
            coverage: 1,
            factualClaimCount: 1,
            supportedClaimCount: 1,
            unsupportedClaims: [],
          },
        }),
      ),
    ).toBe('finalAnswerNode');
  });

  it('routes low LLM citation coverage to citation revision', () => {
    expect(
      routeAfterVerifier.routeAfterCitationCoverage(
        state({
          citationCoverage: {
            mode: 'LLM',
            coverage: 0,
            factualClaimCount: 1,
            supportedClaimCount: 0,
            unsupportedClaims: ['unsupported'],
          },
        }),
      ),
    ).toBe('prepareCitationRevisionNode');
  });

  it('routes exhausted low citation coverage to the generic refusal', () => {
    expect(
      routeAfterVerifier.routeAfterCitationCoverage(
        state({
          citationRetryCount: 1,
          citationCoverage: {
            mode: 'LLM',
            coverage: 0,
            factualClaimCount: 1,
            supportedClaimCount: 0,
            unsupportedClaims: ['unsupported'],
          },
        }),
      ),
    ).toBe('verificationFailureNode');
  });

  it('does not send a deterministically grounded compact transcript fact to refusal', () => {
    expect(
      routeAfterVerifier.routeAfterCitationCoverage(
        state({
          citationCoverage: {
            mode: 'DETERMINISTIC',
            coverage: 1,
            factualClaimCount: 1,
            supportedClaimCount: 1,
            unsupportedClaims: [],
          },
        }),
      ),
    ).toBe('finalAnswerNode');
  });

  it('labels verifier and citation revisions explicitly in graph state', () => {
    expect(
      routeAfterVerifier.createPrepareAnswerRevisionNode()(state()),
    ).toMatchObject({
      retryCount: 1,
      nextDraftSource: 'VERIFIER_REVISION',
    });
    expect(
      routeAfterVerifier.createPrepareCitationRevisionNode()(
        state({
          citationCoverage: {
            mode: 'LLM',
            coverage: 0,
            factualClaimCount: 1,
            supportedClaimCount: 0,
            unsupportedClaims: [],
          },
        }),
      ),
    ).toMatchObject({
      citationRetryCount: 1,
      nextDraftSource: 'CITATION_REVISION',
    });
  });

  it('sets an explicit terminal failure source rather than parsing the refusal text', () => {
    const terminal = routeAfterVerifier.createVerificationFailureNode();
    expect(terminal(state())).toMatchObject({ finalFailureSource: 'VERIFIER' });
    expect(
      terminal(
        state({
          citationCoverage: {
            mode: 'LLM',
            coverage: 0,
            factualClaimCount: 1,
            supportedClaimCount: 0,
            unsupportedClaims: [],
          },
        }),
      ),
    ).toMatchObject({ finalFailureSource: 'CITATION' });
  });
});

describe('LangGraphRagChatWorkflowAdapter diagnostic nodes', () => {
  const makeWorkflow = (answer = 'answer') =>
    new LangGraphRagChatWorkflowAdapter(
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      {
        execute: jest.fn().mockResolvedValue({
          answer,
          claims: [],
          modelRole: 'ANSWER',
        }),
      } as never,
      undefined as never,
      { execute: jest.fn().mockResolvedValue('final') } as never,
      { execute: jest.fn().mockReturnValue('no context') } as never,
      undefined as never,
      undefined as never,
      { get: jest.fn() } as never,
      undefined as never,
    );
  const base = (): RagChatWorkflowState => ({
    userId: 'u',
    conversationId: 'c',
    userMessage: 'q',
    retrievedChunks: [],
    rerankedChunks: [],
    retryCount: 0,
    retrievalRetryCount: 0,
    citationRetryCount: 0,
    citations: [],
    draftHistory: [],
    draftRevision: 0,
    citationAttempts: [],
    nextDraftSource: 'INITIAL',
    finalFailureSource: 'UNKNOWN',
  });

  it('records an initial bounded draft generated by the production draft node', async () => {
    const workflow = makeWorkflow('x'.repeat(1_600)) as any;
    const result = await workflow.createDraftAnswerNode({})(base());
    expect(result.draftHistory).toEqual([
      { revision: 0, source: 'INITIAL', answer: 'x'.repeat(1_500) },
    ]);
  });

  it('uses a bounded grounded verifier revision before calling the draft LLM', async () => {
    const groundedRevision = {
      executeWithProvenance: jest.fn().mockResolvedValue({
        answer: 'One CD is not even one GB.',
        evidenceIds: ['e0'],
        modelRole: 'ANSWER_REVISION',
      }),
    };
    const workflow = new LangGraphRagChatWorkflowAdapter(
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      { execute: jest.fn() } as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      { get: jest.fn() } as never,
      undefined as never,
      groundedRevision as never,
    ) as any;

    const result = await workflow.createDraftAnswerNode({})(
      base({
        nextDraftSource: 'VERIFIER_REVISION',
        verification: {
          passed: false,
          confidence: 1,
          issues: [],
          requiresRevision: true,
        },
      }),
    );

    expect(result).toMatchObject({
      answer: 'One CD is not even one GB.',
      draftHistory: [
        expect.objectContaining({ source: 'GROUNDED_VERIFIER_REVISION' }),
      ],
    });
    expect(groundedRevision.executeWithProvenance).toHaveBeenCalledTimes(1);
  });

  it('bounds graph-generated draft history at configured revision capacity', async () => {
    const workflow = makeWorkflow() as any;
    const draft = workflow.createDraftAnswerNode({});
    let state = base();
    for (let revision = 0; revision < 4; revision += 1) {
      const result = await draft(state);
      state = { ...state, ...result, nextDraftSource: 'VERIFIER_REVISION' };
    }
    expect(state.draftHistory).toHaveLength(2);
    expect(state.draftHistory.map((entry: any) => entry.revision)).toEqual([
      2, 3,
    ]);
  });

  it('preserves terminal failure sources when final streaming runs', async () => {
    const workflow = makeWorkflow() as any;
    const noContext = await workflow.createNoContextAnswerNode({})(base());
    expect(noContext.finalFailureSource).toBe('NO_CONTEXT');
    const final = await workflow.createFinalAnswerNode({})({
      ...base(),
      ...noContext,
    });
    expect(final).toMatchObject({
      answer: 'final',
      finalFailureSource: 'NO_CONTEXT',
    });
  });

  it.each(['VERIFIER', 'CITATION'] as const)(
    'preserves %s when final streaming runs',
    async (finalFailureSource) => {
      const workflow = makeWorkflow() as any;
      await expect(
        workflow.createFinalAnswerNode({})({
          ...base(),
          finalFailureSource,
        }),
      ).resolves.toMatchObject({ finalFailureSource });
    },
  );

  it('marks a successful terminal answer as having no failure source', async () => {
    const workflow = makeWorkflow() as any;
    await expect(
      workflow.createFinalAnswerNode({})(base()),
    ).resolves.toMatchObject({
      answer: 'final',
      finalFailureSource: 'NONE',
    });
  });
});
