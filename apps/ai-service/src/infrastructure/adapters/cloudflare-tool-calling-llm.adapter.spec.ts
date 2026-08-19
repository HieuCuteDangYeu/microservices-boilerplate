import { CloudflareToolCallingLlmAdapter } from './cloudflare-tool-calling-llm.adapter';

describe('CloudflareToolCallingLlmAdapter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('parses OpenAI-compatible function tool calls', async () => {
    const config = {
      getOrThrow: jest.fn((key: string) =>
        key === 'CLOUDFLARE_ACCOUNT_ID' ? 'account' : 'token',
      ),
      get: jest.fn((key: string) =>
        key === 'CLOUDFLARE_TOOL_MODEL' ? '@cf/openai/gpt-oss-20b' : undefined,
      ),
    };
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        choices: [
          {
            finish_reason: 'tool_calls',
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'call-1',
                  type: 'function',
                  function: {
                    name: 'search_reel_content',
                    arguments: '{"query":"postgres setup","limit":5}',
                  },
                },
              ],
            },
          },
        ],
      }),
    } as never);
    const adapter = new CloudflareToolCallingLlmAdapter(config as never);

    await expect(
      adapter.complete({
        messages: [{ role: 'user', content: 'Find the database setup.' }],
        tools: [
          {
            name: 'search_reel_content',
            description: 'Search reel content.',
            parameters: {
              type: 'object',
              required: ['query'],
              properties: { query: { type: 'string' } },
            },
          },
        ],
        toolChoice: 'required',
      }),
    ).resolves.toEqual({
      content: undefined,
      finishReason: 'tool_calls',
      toolCalls: [
        {
          id: 'call-1',
          name: 'search_reel_content',
          arguments: { query: 'postgres setup', limit: 5 },
        },
      ],
    });

    const request = JSON.parse(
      String((fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined)?.body),
    ) as Record<string, unknown>;
    expect(request['tool_choice']).toBe('required');
    expect(request['parallel_tool_calls']).toBe(true);
  });

  it('serializes assistant tool calls and tool results for a follow-up turn', async () => {
    const config = {
      getOrThrow: jest.fn().mockReturnValue('value'),
      get: jest.fn().mockReturnValue(undefined),
    };
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        choices: [{ finish_reason: 'stop', message: { content: 'done' } }],
      }),
    } as never);
    const adapter = new CloudflareToolCallingLlmAdapter(config as never);

    await adapter.complete({
      messages: [
        { role: 'user', content: 'Search.' },
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'call-1',
              name: 'search_reel_content',
              arguments: { query: 'search' },
            },
          ],
        },
        {
          role: 'tool',
          toolCallId: 'call-1',
          name: 'search_reel_content',
          content: '{"resultCount":1}',
        },
      ],
      tools: [],
    });

    const request = JSON.parse(
      String((fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined)?.body),
    ) as { messages: Array<Record<string, unknown>> };
    expect(request.messages[1]?.['tool_calls']).toEqual([
      {
        id: 'call-1',
        type: 'function',
        function: {
          name: 'search_reel_content',
          arguments: '{"query":"search"}',
        },
      },
    ]);
    expect(request.messages[2]).toMatchObject({
      role: 'tool',
      tool_call_id: 'call-1',
      name: 'search_reel_content',
    });
  });
});
