import { ToolCallingRetrievalAgentUseCase } from './tool-calling-retrieval-agent.use-case';

const route = {
  intent: 'REEL_VIDEO_QUESTION' as const,
  needsRetrieval: true,
  needsUserMemory: false,
  needsConversationSummary: false,
  needsVerification: true,
  reelQuestionType: 'TRANSCRIPT_CONTENT' as const,
  requiredEvidence: ['TRANSCRIPT' as const],
  recommendationAction: { type: 'NONE' as const, reason: 'not needed' },
  reason: 'video question',
};

const plan = {
  mode: 'REEL_HYBRID' as const,
  query: 'How was Postgres configured?',
  queries: ['How was Postgres configured?'],
  searchLimit: 8,
  rerankLimit: 5,
  shouldRerank: true,
  reason: 'retrieve reel evidence',
};

const match = {
  chunkId: 'chunk-1',
  reelId: 'reel-1',
  title: 'Postgres tutorial',
  tags: ['postgresql'],
  chunkText: 'PostgreSQL setup steps',
  retrievalText: 'PostgreSQL setup steps',
  evidenceText: 'PostgreSQL setup steps',
  evidenceType: 'TRANSCRIPT' as const,
  startTime: 10,
  endTime: 20,
  distance: 0.1,
  score: 0.9,
  matchedBy: 'HYBRID' as const,
};

const enabledPolicy = {
  enabled: true,
  model: '@cf/test/tool-model',
  maxSteps: 3,
  maxParallelCalls: 2,
  callTimeoutMs: 8_000,
};

describe('ToolCallingRetrievalAgentUseCase', () => {
  it('executes a model-selected high-level search through the retrieval engine port', async () => {
    const toolLlm = {
      complete: jest
        .fn()
        .mockResolvedValueOnce({
          toolCalls: [
            {
              id: 'call-1',
              name: 'search_reel_content',
              arguments: {
                query: 'postgres setup',
                mode: 'REEL_HYBRID',
                evidence: ['TRANSCRIPT'],
                limit: 5,
              },
            },
          ],
        })
        .mockResolvedValueOnce({ toolCalls: [], content: 'enough context' }),
    };
    const retrievalEngine = {
      plan: jest.fn().mockResolvedValue(plan),
      retrieve: jest.fn().mockResolvedValue([match]),
      rerank: jest.fn().mockImplementation(async ({ retrievedChunks }) =>
        retrievedChunks.slice(0, 5),
      ),
    };
    const content = {
      resolveReelContextAccess: jest.fn().mockResolvedValue(['reel-1']),
    };
    const agent = new ToolCallingRetrievalAgentUseCase(
      retrievalEngine as never,
      content as never,
      toolLlm as never,
      enabledPolicy,
    );

    const result = await agent.retrieve({
      userId: 'user-1',
      conversationId: 'conversation-1',
      accessibleReelIds: ['reel-1'],
      route,
      plan,
    });

    expect(result).toEqual([match]);
    expect(retrievalEngine.retrieve).toHaveBeenCalledWith(
      expect.objectContaining({
        accessibleReelIds: ['reel-1'],
        route: expect.objectContaining({ requiredEvidence: ['TRANSCRIPT'] }),
        plan: expect.objectContaining({
          query: 'postgres setup',
          mode: 'REEL_HYBRID',
          searchLimit: 5,
        }),
      }),
    );
    expect(toolLlm.complete).toHaveBeenCalledTimes(2);
    expect(toolLlm.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        model: enabledPolicy.model,
        timeoutMs: enabledPolicy.callTimeoutMs,
      }),
    );
  });

  it('does not let get_reel_context widen the resolved reel access scope', async () => {
    const toolLlm = {
      complete: jest
        .fn()
        .mockResolvedValueOnce({
          toolCalls: [
            {
              id: 'call-1',
              name: 'get_reel_context',
              arguments: { reelId: 'private-reel', query: 'secret' },
            },
          ],
        })
        .mockResolvedValueOnce({ toolCalls: [] }),
    };
    const retrievalEngine = {
      plan: jest.fn().mockResolvedValue(plan),
      retrieve: jest.fn().mockResolvedValue([]),
      rerank: jest.fn().mockResolvedValue([]),
    };
    const agent = new ToolCallingRetrievalAgentUseCase(
      retrievalEngine as never,
      { resolveReelContextAccess: jest.fn() } as never,
      toolLlm as never,
      enabledPolicy,
    );

    await agent.retrieve({
      userId: 'user-1',
      conversationId: 'conversation-1',
      accessibleReelIds: ['reel-1'],
      route,
      plan: { ...plan, searchLimit: 3, rerankLimit: 3 },
    });

    // The unauthorized tool request yields no items, then the agent falls back
    // once to the deterministic engine using the already-resolved scope.
    expect(retrievalEngine.retrieve).toHaveBeenCalledTimes(1);
    expect(retrievalEngine.retrieve).toHaveBeenCalledWith(
      expect.objectContaining({ accessibleReelIds: ['reel-1'] }),
    );
  });

  it('delegates planning and reranking to the deterministic engine port', async () => {
    const retrievalEngine = {
      plan: jest.fn().mockResolvedValue(plan),
      retrieve: jest.fn().mockResolvedValue([match]),
      rerank: jest.fn().mockResolvedValue([match]),
    };
    const agent = new ToolCallingRetrievalAgentUseCase(
      retrievalEngine as never,
      { resolveReelContextAccess: jest.fn() } as never,
      { complete: jest.fn() } as never,
      { ...enabledPolicy, enabled: false },
    );

    await expect(agent.plan({ message: plan.query, route })).resolves.toEqual(
      plan,
    );
    await expect(
      agent.rerank({ plan, retrievedChunks: [match] }),
    ).resolves.toEqual([match]);
    expect(retrievalEngine.plan).toHaveBeenCalledTimes(1);
    expect(retrievalEngine.rerank).toHaveBeenCalledTimes(1);
  });
});
