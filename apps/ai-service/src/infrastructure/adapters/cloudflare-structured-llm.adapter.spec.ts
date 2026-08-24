import { CloudflareStructuredLlmAdapter } from './cloudflare-structured-llm.adapter';

describe('CloudflareStructuredLlmAdapter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('accepts strict JSON that satisfies the requested schema', async () => {
    const config = {
      getOrThrow: jest.fn((key: string) =>
        key === 'CLOUDFLARE_ACCOUNT_ID' ? 'account' : 'token',
      ),
      get: jest.fn().mockReturnValue('@cf/test/structured'),
    };
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        choices: [{ message: { content: '{"passed":true}' } }],
      }),
    } as never);
    const adapter = new CloudflareStructuredLlmAdapter(config as never);

    await expect(
      adapter.generateObject({
        systemPrompt: 'Return JSON.',
        userPrompt: 'Set passed.',
        model: '@cf/test/structured',
        jsonSchema: {
          type: 'object',
          properties: { passed: { type: 'boolean' } },
          required: ['passed'],
          additionalProperties: false,
        },
      }),
    ).resolves.toEqual({ passed: true });
  });

  it('rejects prose or fenced output instead of recovering JSON from it', async () => {
    const config = {
      getOrThrow: jest.fn().mockReturnValue('value'),
      get: jest.fn().mockReturnValue('@cf/test/structured'),
    };
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'not-json' } }],
      }),
    } as never);
    const adapter = new CloudflareStructuredLlmAdapter(config as never);

    await expect(
      adapter.generateObject({
        systemPrompt: 'Return JSON.',
        userPrompt: 'Set passed.',
        model: '@cf/test/structured',
        jsonSchema: { type: 'object' },
      }),
    ).rejects.toThrow('Cloudflare structured LLM returned invalid JSON');
  });

  it('rejects parsed objects with unknown enum values or properties', async () => {
    const config = {
      getOrThrow: jest.fn().mockReturnValue('value'),
      get: jest.fn().mockReturnValue('false'),
    };
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        choices: [
          { message: { content: '{"decision":"MAYBE","extra":true}' } },
        ],
      }),
    } as never);
    const adapter = new CloudflareStructuredLlmAdapter(config as never);

    await expect(
      adapter.generateObject({
        systemPrompt: 'Return JSON.',
        userPrompt: 'Decide.',
        model: '@cf/test/structured',
        jsonSchema: {
          type: 'object',
          properties: {
            decision: { type: 'string', enum: ['YES', 'NO'] },
          },
          required: ['decision'],
          additionalProperties: false,
        },
      }),
    ).rejects.toThrow('local schema validation');
  });

  it.each([
    ['missing required key', '{}'],
    ['malformed array', '{"items":"not-an-array"}'],
    ['oversized array', '{"items":["a","b"]}'],
  ])('rejects %s', async (_name, content) => {
    const config = {
      getOrThrow: jest.fn().mockReturnValue('value'),
      get: jest.fn().mockReturnValue('false'),
    };
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        choices: [{ message: { content } }],
      }),
    } as never);
    const adapter = new CloudflareStructuredLlmAdapter(config as never);

    await expect(
      adapter.generateObject({
        systemPrompt: 'Return JSON.',
        userPrompt: 'Return one item.',
        model: '@cf/test/structured',
        jsonSchema: {
          type: 'object',
          additionalProperties: false,
          required: ['items'],
          properties: {
            items: {
              type: 'array',
              maxItems: 1,
              items: { type: 'string' },
            },
          },
        },
      }),
    ).rejects.toThrow('local schema validation');
  });
});
