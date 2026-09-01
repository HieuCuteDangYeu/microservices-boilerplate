import type { GenerateStructuredObjectInput } from '@ai/domain/interfaces/structured-llm.service.interface';
import { CloudflareStructuredLlmAdapter } from './cloudflare-structured-llm.adapter';

describe('Cloudflare router transport contracts and safe diagnostics', () => {
  const schema = {
    type: 'object' as const,
    properties: {
      requiredEvidence: { type: 'array', items: { type: 'string' } },
    },
    required: ['requiredEvidence'],
    additionalProperties: false,
  };
  const input: GenerateStructuredObjectInput = {
    model: '@cf/openai/gpt-oss-20b',
    modelRole: 'ROUTER',
    systemPrompt: 'Same semantic instructions',
    userPrompt: 'Same question',
    jsonSchema: schema,
    schemaVersion: 'router-semantic-v2',
    timeoutMs: 45000,
    maxTokens: 2048,
    temperature: 0,
  };
  const tool = (args: unknown, name = 'route_message') => ({
    type: 'function',
    function: { name, arguments: args },
  });
  function setup(
    message: Record<string, unknown>,
    contract = 'CHAT_JSON_SCHEMA',
    finish = 'stop',
    usage = {},
  ) {
    const config = {
      getOrThrow: jest.fn().mockReturnValue('synthetic-credential'),
      get: jest.fn(
        (key: string) =>
          ({
            CLOUDFLARE_ROUTER_OUTPUT_CONTRACT: contract,
            CLOUDFLARE_AI_GATEWAY_ENABLED: 'false',
            CLOUDFLARE_STRUCTURED_REASONING_EFFORT: 'low',
          })[key],
      ),
    };
    const payload = { choices: [{ finish_reason: finish, message }], usage };
    const fetch = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(payload),
    } as never);
    return {
      adapter: new CloudflareStructuredLlmAdapter(config as never),
      fetch,
      diagnostics: jest.fn(),
    };
  }
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['string', 'private-content'],
    ['object', { secret: 'private-content' }],
    ['null', null],
    ['number', 42],
    ['boolean', true],
  ])(
    'retains only expected array and actual %s on a type failure',
    async (type, value) => {
      const { adapter, diagnostics } = setup({
        content: JSON.stringify({ requiredEvidence: value }),
      });
      await expect(
        adapter.generateObject({ ...input, onDiagnostics: diagnostics }),
      ).rejects.toMatchObject({
        code: 'STRUCTURED_COMPLETION_SCHEMA_INVALID',
        path: '$.requiredEvidence',
        constraint: 'type',
        expectedType: 'array',
        actualJsonType: type,
      });
      expect(diagnostics).toHaveBeenCalledWith(
        expect.objectContaining({
          schemaPath: '$.requiredEvidence',
          schemaConstraint: 'type',
          schemaVersion: 'router-semantic-v2',
          expectedType: 'array',
          actualJsonType: type,
        }),
      );
      expect(JSON.stringify(diagnostics.mock.calls)).not.toContain(
        'private-content',
      );
    },
  );

  it('records an actual array without its contents when a string was required', async () => {
    const { adapter, diagnostics } = setup({
      content: '{"requiredEvidence":["private-content"]}',
    });
    await expect(
      adapter.generateObject({
        ...input,
        onDiagnostics: diagnostics,
        jsonSchema: {
          ...schema,
          properties: { requiredEvidence: { type: 'string' } },
        },
      }),
    ).rejects.toMatchObject({
      expectedType: 'string',
      actualJsonType: 'array',
    });
    expect(JSON.stringify(diagnostics.mock.calls)).not.toContain(
      'private-content',
    );
  });

  it('retains safe truncation metadata and an explicitly supplied reasoning count', async () => {
    const { adapter, diagnostics } = setup(
      {
        content: 'private-truncated-reasoning',
        tool_calls: [tool('private-args')],
      },
      'CHAT_TOOL_CALL',
      'length',
      {
        prompt_tokens: 100,
        completion_tokens: 2048,
        total_tokens: 2148,
        completion_tokens_details: { reasoning_tokens: 1900 },
      },
    );
    await expect(
      adapter.generateObject({ ...input, onDiagnostics: diagnostics }),
    ).rejects.toMatchObject({ code: 'STRUCTURED_COMPLETION_TRUNCATED' });
    expect(diagnostics).toHaveBeenCalledWith(
      expect.objectContaining({
        endpointContract: 'CHAT_TOOL_CALL',
        finishReason: 'length',
        configuredMaxCompletionTokens: 2048,
        configuredTimeoutMs: 45000,
        responseContentType: 'string',
        contentPresent: true,
        toolCallsPresent: true,
        usage: {
          inputTokens: 100,
          outputTokens: 2048,
          totalTokens: 2148,
          reasoningTokens: 1900,
        },
      }),
    );
    expect(JSON.stringify(diagnostics.mock.calls)).not.toContain('private-');
  });

  it('validates a single typed tool without executing any action or changing prompts', async () => {
    const args = { requiredEvidence: ['NONE'] };
    const { adapter, fetch, diagnostics } = setup(
      { content: null, tool_calls: [tool(JSON.stringify(args))] },
      'CHAT_TOOL_CALL',
      'tool_calls',
    );
    await expect(
      adapter.generateObject({ ...input, onDiagnostics: diagnostics }),
    ).resolves.toEqual(args);
    const body = JSON.parse(fetch.mock.calls[0][1]?.body as string);
    expect(body.messages).toEqual([
      { role: 'system', content: input.systemPrompt },
      { role: 'user', content: input.userPrompt },
    ]);
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0].function.parameters).toEqual(schema);
    expect(body.tools[0].function.name).toBe('route_message');
    expect(body).not.toHaveProperty('tool_choice');
    expect(body).not.toHaveProperty('response_format');
    expect(body.max_completion_tokens).toBe(2048);
    expect(body.reasoning_effort).toBe('low');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(diagnostics).toHaveBeenCalledWith(
      expect.objectContaining({
        responseContentType: 'null',
        contentPresent: false,
        toolCallsPresent: true,
      }),
    );
    expect(diagnostics.mock.calls[0][0].usage.reasoningTokens).toBeUndefined();
  });

  it.each([
    { content: '{"requiredEvidence":["NONE"]}' },
    { tool_calls: [] },
    { tool_calls: [tool('{}'), tool('{}')] },
    { tool_calls: [tool('{}', 'external_action')] },
    { tool_calls: [tool(null)] },
    { tool_calls: [tool('```json\n{}\n```')] },
    { tool_calls: [tool('{"requiredEvidence":"NONE"}')] },
  ])(
    'fails closed for malformed tool transport without text recovery',
    async (message) => {
      const { adapter, fetch } = setup(message, 'CHAT_TOOL_CALL');
      await expect(adapter.generateObject(input)).rejects.toThrow();
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it('leaves non-router roles on the existing JSON contract', async () => {
    const { adapter, fetch } = setup(
      { content: '{"requiredEvidence":["NONE"]}' },
      'CHAT_TOOL_CALL',
    );
    await adapter.generateObject({ ...input, modelRole: 'VERIFIER' });
    const body = JSON.parse(fetch.mock.calls[0][1]?.body as string);
    expect(body.response_format).toEqual({
      type: 'json_schema',
      json_schema: schema,
    });
    expect(body).not.toHaveProperty('tools');
  });

  it('validates already typed arguments without coercion', async () => {
    const args = { requiredEvidence: ['NONE'] };
    const { adapter } = setup({ tool_calls: [tool(args)] }, 'CHAT_TOOL_CALL');
    await expect(adapter.generateObject(input)).resolves.toEqual(args);
  });
});
