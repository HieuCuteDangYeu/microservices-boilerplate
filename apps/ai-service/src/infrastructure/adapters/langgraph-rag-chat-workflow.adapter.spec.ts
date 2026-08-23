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
});
