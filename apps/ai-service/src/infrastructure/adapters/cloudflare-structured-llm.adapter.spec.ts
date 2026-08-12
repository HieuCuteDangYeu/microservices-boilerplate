import { CloudflareStructuredLlmAdapter } from './cloudflare-structured-llm.adapter';

describe('CloudflareStructuredLlmAdapter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('recovers a fenced JSON object returned by the structured provider', async () => {
    const config = {
      getOrThrow: jest.fn((key: string) =>
        key === 'CLOUDFLARE_ACCOUNT_ID' ? 'account' : 'token',
      ),
      get: jest.fn().mockReturnValue('@cf/test/structured'),
    };
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        choices: [{ message: { content: '```json\n{"passed":true}\n```' } }],
      }),
    } as never);
    const adapter = new CloudflareStructuredLlmAdapter(config as never);

    await expect(
      adapter.generateObject({
        systemPrompt: 'Return JSON.',
        userPrompt: 'Set passed.',
        jsonSchema: { type: 'object' },
      }),
    ).resolves.toEqual({ passed: true });
  });

  it('fails when no JSON object can be recovered', async () => {
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
        jsonSchema: { type: 'object' },
      }),
    ).rejects.toThrow('Cloudflare structured LLM returned invalid JSON');
  });
});
