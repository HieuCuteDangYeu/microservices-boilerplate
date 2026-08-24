import {
  CloudflareStructuredLlmAdapter,
  StructuredCompletionEmptyContentError,
  StructuredCompletionInvalidJsonError,
  StructuredCompletionProviderError,
  StructuredCompletionSchemaError,
  StructuredCompletionTimeoutError,
  StructuredCompletionTruncatedError,
} from './cloudflare-structured-llm.adapter';

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
        choices: [
          { finish_reason: 'stop', message: { content: '{"passed":true}' } },
        ],
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
        choices: [{ finish_reason: 'stop', message: { content: 'not-json' } }],
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
    ).rejects.toBeInstanceOf(StructuredCompletionInvalidJsonError);
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
          {
            finish_reason: 'stop',
            message: { content: '{"decision":"MAYBE","extra":true}' },
          },
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
    ).rejects.toBeInstanceOf(StructuredCompletionSchemaError);
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
        choices: [{ finish_reason: 'stop', message: { content } }],
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
    ).rejects.toBeInstanceOf(StructuredCompletionSchemaError);
  });

  it.each([
    ['partial JSON', '{"passed":'],
    ['parseable JSON', '{"passed":true}'],
  ])('rejects length-finished %s before parsing', async (_name, content) => {
    const config = {
      getOrThrow: jest.fn().mockReturnValue('value'),
      get: jest.fn().mockReturnValue('false'),
    };
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        choices: [{ finish_reason: 'length', message: { content } }],
      }),
    } as never);
    const adapter = new CloudflareStructuredLlmAdapter(config as never);

    await expect(
      adapter.generateObject({
        systemPrompt: 'Return JSON.',
        userPrompt: 'Set passed.',
        model: '@cf/openai/gpt-oss-120b',
        maxTokens: 1_024,
        jsonSchema: { type: 'object' },
      }),
    ).rejects.toMatchObject({
      name: StructuredCompletionTruncatedError.name,
      requestedMaxTokens: 1_024,
      finishReason: 'length',
    });
  });

  it('rejects an empty stopped completion with a typed error', async () => {
    const config = {
      getOrThrow: jest.fn().mockReturnValue('value'),
      get: jest.fn().mockReturnValue('false'),
    };
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        choices: [{ finish_reason: 'stop', message: { content: '' } }],
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
    ).rejects.toBeInstanceOf(StructuredCompletionEmptyContentError);
  });

  it.each([429, 500])(
    'redacts provider details for HTTP %i failures',
    async (status) => {
      const config = {
        getOrThrow: jest.fn().mockReturnValue('value'),
        get: jest.fn().mockReturnValue('false'),
      };
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status,
        json: jest.fn().mockResolvedValue({
          errors: [{ message: 'secret provider diagnostic' }],
        }),
      } as never);
      const adapter = new CloudflareStructuredLlmAdapter(config as never);

      const request = adapter.generateObject({
        systemPrompt: 'Return JSON.',
        userPrompt: 'Set passed.',
        model: '@cf/test/structured',
        jsonSchema: { type: 'object' },
      });
      await expect(request).rejects.toBeInstanceOf(
        StructuredCompletionProviderError,
      );
      await expect(request).rejects.not.toThrow('secret provider diagnostic');
    },
  );

  it('classifies an aborted request as a typed timeout', async () => {
    jest.useFakeTimers();
    const config = {
      getOrThrow: jest.fn().mockReturnValue('value'),
      get: jest.fn().mockReturnValue('false'),
    };
    jest.spyOn(global, 'fetch').mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new Error('aborted')),
          );
        }),
    );
    const adapter = new CloudflareStructuredLlmAdapter(config as never);
    const request = adapter.generateObject({
      systemPrompt: 'Return JSON.',
      userPrompt: 'Set passed.',
      model: '@cf/test/structured',
      timeoutMs: 500,
      jsonSchema: { type: 'object' },
    });

    jest.advanceTimersByTime(500);
    await expect(request).rejects.toBeInstanceOf(
      StructuredCompletionTimeoutError,
    );
    jest.useRealTimers();
  });
});
