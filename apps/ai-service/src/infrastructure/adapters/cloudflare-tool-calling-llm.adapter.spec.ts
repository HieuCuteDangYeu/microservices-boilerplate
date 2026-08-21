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

    const body = fetchSpy.mock.calls[0]?.[1]?.body;
    if (typeof body !== 'string') {
      throw new Error('Expected Cloudflare request body to be a JSON string.');
    }
    const request = JSON.parse(body) as Record<string, unknown>;
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

    const body = fetchSpy.mock.calls[0]?.[1]?.body;
    if (typeof body !== 'string') {
      throw new Error('Expected Cloudflare request body to be a JSON string.');
    }
    const request = JSON.parse(body) as {
      messages: Array<Record<string, unknown>>;
    };
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
    expect(request.messages[1]?.['content']).toBe('');
    expect(request.messages[2]).toMatchObject({
      role: 'tool',
      tool_call_id: 'call-1',
      name: 'search_reel_content',
    });
  });

  it('surfaces a safe Cloudflare validation error', async () => {
    const config = {
      getOrThrow: jest.fn().mockReturnValue('value'),
      get: jest.fn().mockReturnValue(undefined),
    };
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      json: jest.fn().mockResolvedValue({
        error: { message: "Type mismatch of '/messages/2/content'" },
      }),
    } as never);
    const adapter = new CloudflareToolCallingLlmAdapter(config as never);

    await expect(
      adapter.complete({
        messages: [{ role: 'user', content: 'Search.' }],
        tools: [],
      }),
    ).rejects.toThrow("Type mismatch of '/messages/2/content'");
  });
});
