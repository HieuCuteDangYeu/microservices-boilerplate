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
        jsonSchema: { type: 'object', properties: {} },
      }),
    ).rejects.toBeInstanceOf(StructuredCompletionInvalidJsonError);
  });

  it('rejects parsed objects with unknown enum values or properties', async () => {
    const config = {
      getOrThrow: jest.fn().mockReturnValue('value'),
      get: jest.fn((key: string) =>
        key === 'CLOUDFLARE_AI_GATEWAY_ENABLED' ? 'true' : undefined,
      ),
    };
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('captures a safe schema path and constraint without the rejected value', async () => {
    const config = {
      getOrThrow: jest.fn().mockReturnValue('value'),
      get: jest.fn().mockReturnValue('false'),
    };
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        choices: [
          {
            finish_reason: 'stop',
            message: { content: '{"items":[{"id":"private-value-too-long"}]}' },
          },
        ],
      }),
    } as never);
    const diagnostics = jest.fn();

    await expect(
      new CloudflareStructuredLlmAdapter(config as never).generateObject({
        systemPrompt: 'Return JSON.',
        userPrompt: 'Return an item.',
        model: '@cf/test/structured',
        schemaVersion: 'safe-v1',
        onDiagnostics: diagnostics,
        jsonSchema: {
          type: 'object',
          required: ['items'],
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                required: ['id'],
                properties: { id: { type: 'string', maxLength: 8 } },
              },
            },
          },
        },
      }),
    ).rejects.toMatchObject({
      path: '$.items[0].id',
      constraint: 'maxLength',
      schemaVersion: 'safe-v1',
    });
    expect(diagnostics).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaPath: '$.items[0].id',
        schemaConstraint: 'maxLength',
        schemaVersion: 'safe-v1',
      }),
    );
    expect(JSON.stringify(diagnostics.mock.calls)).not.toContain(
      'private-value-too-long',
    );
  });

  it('never copies an unexpected provider property name into diagnostics or logs', async () => {
    const sentinel = 'synthetic-private-key';
    const debug = jest
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation(() => undefined);
    const diagnostics = jest.fn();
    const content = JSON.stringify({ nested: { [sentinel]: 'private-value' } });
    const payload = {
      choices: [{ finish_reason: 'stop', message: { content } }],
    };
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(payload),
    } as never);
    const config = {
      getOrThrow: jest.fn().mockReturnValue('test'),
      get: jest.fn().mockReturnValue('false'),
    };
    let error: unknown;
    try {
      await new CloudflareStructuredLlmAdapter(config as never).generateObject({
        model: '@cf/test/structured',
        systemPrompt: 'Return JSON.',
        userPrompt: 'Generic control.',
        schemaVersion: 'safe-v2',
        onDiagnostics: diagnostics,
        jsonSchema: {
          type: 'object',
          properties: {
            nested: {
              type: 'object',
              additionalProperties: false,
              properties: {},
            },
          },
          required: ['nested'],
        },
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(StructuredCompletionSchemaError);
    const leaked = JSON.stringify([
      String(error),
      diagnostics.mock.calls,
      debug.mock.calls,
    ]).includes(sentinel);
    expect(leaked).toBe(false);
    expect(diagnostics).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaPath: '$.nested',
        schemaConstraint: 'additionalProperties',
      }),
    );
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
        jsonSchema: { type: 'object', properties: {} },
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
        jsonSchema: { type: 'object', properties: {} },
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
        jsonSchema: { type: 'object', properties: {} },
      });
      await expect(request).rejects.toBeInstanceOf(
        StructuredCompletionProviderError,
      );
      await expect(request).rejects.not.toThrow('secret provider diagnostic');
    },
  );

  it.each([
    [3036, false, 'ACCOUNT_LIMITED'],
    [3040, true, 'OUT_OF_CAPACITY'],
  ])(
    'classifies Cloudflare 429 code %i with transient=%s and category=%s',
    async (providerCode, transient, providerCategory) => {
      const config = {
        getOrThrow: jest.fn().mockReturnValue('value'),
        get: jest.fn().mockReturnValue('false'),
      };
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 429,
        headers: {
          get: jest.fn((name: string) =>
            name === 'retry-after'
              ? '2'
              : name === 'cf-ray'
                ? 'safe-ray-id'
                : null,
          ),
        },
        json: jest.fn().mockResolvedValue({
          errors: [{ code: providerCode, message: 'redacted provider detail' }],
        }),
      } as never);
      const diagnostics = jest.fn();

      await expect(
        new CloudflareStructuredLlmAdapter(config as never).generateObject({
          systemPrompt: 'Return JSON.',
          userPrompt: 'Set passed.',
          model: '@cf/test/structured',
          onDiagnostics: diagnostics,
          jsonSchema: { type: 'object', properties: {} },
        }),
      ).rejects.toMatchObject({
        status: 429,
        providerCode,
        providerCategory,
        retryAfterMs: 2_000,
        requestId: 'safe-ray-id',
        transient,
      });
      expect(diagnostics).toHaveBeenCalledWith(
        expect.objectContaining({
          providerCode,
          providerCategory,
          retryAfterMs: 2_000,
          requestId: 'safe-ray-id',
          transient,
        }),
      );
    },
  );

  it.each([408, 500, 502, 503, 504])(
    'classifies HTTP %i as a transient provider failure',
    async (status) => {
      const config = {
        getOrThrow: jest.fn().mockReturnValue('value'),
        get: jest.fn().mockReturnValue('false'),
      };
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status,
        headers: { get: jest.fn().mockReturnValue(null) },
        json: jest.fn().mockResolvedValue({ errors: [] }),
      } as never);

      await expect(
        new CloudflareStructuredLlmAdapter(config as never).generateObject({
          systemPrompt: 'Return JSON.',
          userPrompt: 'Set passed.',
          model: '@cf/test/structured',
          jsonSchema: { type: 'object', properties: {} },
        }),
      ).rejects.toMatchObject({ status, transient: true });
    },
  );

  it('classifies a network failure as transient without exposing its detail', async () => {
    const config = {
      getOrThrow: jest.fn().mockReturnValue('value'),
      get: jest.fn().mockReturnValue('false'),
    };
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new Error('private network detail'));
    const diagnostics = jest.fn();

    const request = new CloudflareStructuredLlmAdapter(
      config as never,
    ).generateObject({
      systemPrompt: 'Return JSON.',
      userPrompt: 'Set passed.',
      model: '@cf/test/structured',
      onDiagnostics: diagnostics,
      jsonSchema: { type: 'object', properties: {} },
    });
    await expect(request).rejects.toMatchObject({ transient: true });
    await expect(request).rejects.not.toThrow('private network detail');
    expect(diagnostics).toHaveBeenCalledWith(
      expect.objectContaining({
        providerStatus: 'NETWORK_ERROR',
        transient: true,
      }),
    );
  });

  it.each([
    [500, 500],
    [45_000, 45_000],
    [60_000, 60_000],
    [130_000, 120_000],
  ])(
    'classifies an aborted request at requested timeout %i as %i',
    async (requestedTimeout, expectedTimeout) => {
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
      const diagnostics = jest.fn();
      const request = adapter.generateObject({
        systemPrompt: 'Return JSON.',
        userPrompt: 'Set passed.',
        model: '@cf/test/structured',
        timeoutMs: requestedTimeout,
        onDiagnostics: diagnostics,
        jsonSchema: { type: 'object', properties: {} },
      });

      jest.advanceTimersByTime(expectedTimeout);
      await expect(request).rejects.toMatchObject({
        name: StructuredCompletionTimeoutError.name,
        timeoutMs: expectedTimeout,
      });
      expect(diagnostics).toHaveBeenCalledWith(
        expect.objectContaining({
          providerStatus: 'TIMEOUT',
          transient: true,
          providerCategory: 'TRANSIENT_PROVIDER_FAILURE',
        }),
      );
      jest.useRealTimers();
    },
  );

  it('uses max_completion_tokens without deprecated max_tokens', async () => {
    const config = {
      getOrThrow: jest.fn().mockReturnValue('value'),
      get: jest.fn((key: string) =>
        key === 'CLOUDFLARE_AI_GATEWAY_ENABLED' ? 'true' : undefined,
      ),
    };
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        choices: [
          { finish_reason: 'stop', message: { content: '{"ok":true}' } },
        ],
      }),
    } as never);
    const adapter = new CloudflareStructuredLlmAdapter(config as never);

    await adapter.generateObject({
      systemPrompt: 'Return JSON.',
      userPrompt: 'Return ok.',
      model: '@cf/test/structured',
      maxTokens: 768,
      jsonSchema: {
        type: 'object',
        properties: { ok: { type: 'boolean' } },
        required: ['ok'],
      },
    });

    const requestBody = fetchMock.mock.calls[0]?.[1]?.body;
    expect(typeof requestBody).toBe('string');
    const body = JSON.parse(requestBody as string) as Record<string, unknown>;
    expect(body).toMatchObject({ max_completion_tokens: 768 });
    expect(body).not.toHaveProperty('max_tokens');
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      'cf-aig-max-attempts': '1',
      'cf-aig-retry-delay': '250',
      'cf-aig-backoff': 'exponential',
    });
  });
});
import { Logger } from '@nestjs/common';
