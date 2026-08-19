import { ToolCallingRetrievalAgentUseCase } from './tool-calling-retrieval-agent.use-case';

describe('ToolCallingRetrievalAgentUseCase', () => {
  it('executes a model-selected high-level search through the existing retrieval engine', async () => {
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
    const embedding = {
      generateVector: jest.fn().mockResolvedValue({ values: [0.1, 0.2] }),
    };
    const content = {
      resolveReelContextAccess: jest.fn().mockResolvedValue(['reel-1']),
    };
    const semanticIndex = {
      searchChunks: jest.fn().mockResolvedValue([
        {
          id: 'chunk-1',
          reelId: 'reel-1',
          ordinal: 0,
          userId: 'user-1',
          text: 'PostgreSQL setup steps',
          retrievalText: 'PostgreSQL setup steps',
          evidenceText: 'PostgreSQL setup steps',
          evidenceType: 'TRANSCRIPT',
          tags: ['postgresql'],
          startTime: 10,
          endTime: 20,
          sourceDurationMs: 60_000,
          sourceOrientation: 'PORTRAIT',
          sourceLengthClass: 'SHORT',
          rrfScore: 0.9,
          vectorDistance: 0.1,
          vectorRank: 1,
          keywordRank: 1,
        },
      ]),
      searchVisualScenes: jest.fn().mockResolvedValue([]),
      getAdjacentChunks: jest.fn().mockResolvedValue([]),
      getReelDocument: jest.fn().mockResolvedValue({
        id: 'reel-doc-1',
        reelId: 'reel-1',
        userId: 'user-1',
        title: 'Postgres tutorial',
        text: 'Postgres tutorial',
        tags: ['postgresql'],
        sourceDurationMs: 60_000,
        sourceOrientation: 'PORTRAIT',
        sourceLengthClass: 'SHORT',
        indexAttemptId: 'attempt-1',
        indexVersion: 'v1',
        embeddingProvider: 'test',
        embeddingModel: 'test',
        embeddingDimensions: 2,
        embeddingVersion: 'v1',
        chunkingVersion: 'v1',
        summaryVersion: 'v1',
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      }),
    };
    const configValues: Record<string, string> = {
      RAG_TOOL_CALLING_ENABLED: 'true',
      RAG_HIERARCHICAL_RETRIEVAL_ENABLED: 'false',
      RAG_HIERARCHICAL_RETRIEVAL_SHADOW_ENABLED: 'false',
    };
    const config = {
      get: jest.fn((key: string) => configValues[key]),
    };
    const agent = new ToolCallingRetrievalAgentUseCase(
      {} as never,
      embedding as never,
      content as never,
      semanticIndex as never,
      {} as never,
      { save: jest.fn() } as never,
      toolLlm as never,
      config as never,
    );

    const result = await agent.retrieve({
      userId: 'user-1',
      conversationId: 'conversation-1',
      accessibleReelIds: ['reel-1'],
      route: {
        intent: 'REEL_VIDEO_QUESTION',
        needsRetrieval: true,
        needsUserMemory: false,
        needsConversationSummary: false,
        needsVerification: true,
        reelQuestionType: 'TRANSCRIPT_CONTENT',
        requiredEvidence: ['TRANSCRIPT'],
        recommendationAction: { type: 'NONE', reason: 'not needed' },
        reason: 'video question',
      },
      plan: {
        mode: 'REEL_HYBRID',
        query: 'How was Postgres configured?',
        queries: ['How was Postgres configured?'],
        searchLimit: 8,
        rerankLimit: 5,
        shouldRerank: true,
        reason: 'retrieve reel evidence',
      },
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      chunkId: 'chunk-1',
      reelId: 'reel-1',
      chunkText: 'PostgreSQL setup steps',
    });
    expect(semanticIndex.searchChunks).toHaveBeenCalledWith(
      expect.objectContaining({
        queryText: 'postgres setup',
        filters: { reelIds: ['reel-1'] },
        limit: 5,
      }),
    );
    expect(toolLlm.complete).toHaveBeenCalledTimes(2);
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
    const config = {
      get: jest.fn((key: string) =>
        key === 'RAG_TOOL_CALLING_ENABLED'
          ? 'true'
          : key === 'RAG_HIERARCHICAL_RETRIEVAL_SHADOW_ENABLED'
            ? 'false'
            : undefined,
      ),
    };
    const semanticIndex = {
      searchChunks: jest.fn().mockResolvedValue([]),
      searchVisualScenes: jest.fn().mockResolvedValue([]),
      getAdjacentChunks: jest.fn().mockResolvedValue([]),
      getReelDocument: jest.fn().mockResolvedValue(null),
    };
    const agent = new ToolCallingRetrievalAgentUseCase(
      {} as never,
      { generateVector: jest.fn().mockResolvedValue({ values: [0.1] }) } as never,
      { resolveReelContextAccess: jest.fn() } as never,
      semanticIndex as never,
      {} as never,
      { save: jest.fn() } as never,
      toolLlm as never,
      config as never,
    );

    await agent.retrieve({
      userId: 'user-1',
      conversationId: 'conversation-1',
      accessibleReelIds: ['reel-1'],
      route: {
        intent: 'REEL_VIDEO_QUESTION',
        needsRetrieval: true,
        needsUserMemory: false,
        needsConversationSummary: false,
        needsVerification: true,
        reelQuestionType: 'TRANSCRIPT_CONTENT',
        requiredEvidence: ['TRANSCRIPT'],
        recommendationAction: { type: 'NONE', reason: 'none' },
        reason: 'video question',
      },
      plan: {
        mode: 'REEL_HYBRID',
        query: 'question',
        queries: ['question'],
        searchLimit: 3,
        rerankLimit: 3,
        shouldRerank: true,
        reason: 'test',
      },
    });

    expect(semanticIndex.searchChunks).toHaveBeenCalledTimes(1);
    expect(semanticIndex.searchChunks).toHaveBeenCalledWith(
      expect.objectContaining({ filters: { reelIds: ['reel-1'] } }),
    );
  });
});
