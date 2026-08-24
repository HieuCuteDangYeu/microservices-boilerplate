import type { IStructuredLlmService } from '@ai/domain/interfaces/structured-llm.service.interface';
import type { ConfigService } from '@nestjs/config';
import { CloudflareCitationAttributionAdapter } from './cloudflare-citation-attribution.adapter';

describe('CloudflareCitationAttributionAdapter', () => {
  const aiConfig = {
    model: jest.fn(() => '@cf/test/citation'),
    timeoutMs: jest.fn(() => 4_000),
    maxCompletionTokens: jest.fn(() => 768),
  };
  const createConfig = (values: Record<string, string> = {}) =>
    ({
      get: jest.fn((key: string) => values[key]),
      getOrThrow: jest.fn((key: string) => {
        if (key === 'AI_CITATION_ATTRIBUTION_MODEL') {
          return values[key] ?? '@cf/test/citation';
        }
        const value = values[key];
        if (!value) throw new Error(`Missing ${key}`);
        return value;
      }),
    }) as unknown as ConfigService;

  it('rejects claim mappings containing unknown evidence IDs', async () => {
    const structuredLlmService: IStructuredLlmService = {
      generateObject: jest.fn().mockResolvedValue({
        claims: [
          {
            claim: 'The screen shows a module-not-found error.',
            supported: true,
            evidenceIds: ['e0', 'invented'],
            confidence: 0.92,
          },
          {
            claim: 'It is caused by a production dependency.',
            supported: true,
            evidenceIds: ['e1'],
            confidence: 0.2,
          },
        ],
      }),
    };
    const adapter = new CloudflareCitationAttributionAdapter(
      structuredLlmService,
      createConfig(),
      aiConfig as never,
    );

    await expect(
      adapter.attribute({
        question: 'What error is visible?',
        answer:
          'The screen shows a module-not-found error caused by a production dependency.',
        maxCitations: 3,
        candidates: [
          {
            evidenceId: 'e0',
            reelId: 'r1',
            evidenceType: 'VISUAL',
            evidenceText: 'Visible text: Cannot find module @nestjs/config',
          },
          {
            evidenceId: 'e1',
            reelId: 'r1',
            evidenceType: 'TRANSCRIPT',
            evidenceText: 'The speaker says they are debugging the app.',
          },
        ],
      }),
    ).resolves.toEqual({
      selections: [],
      claims: [
        {
          claim: 'The screen shows a module-not-found error.',
          supported: false,
          evidenceIds: [],
          confidence: 0.92,
        },
        {
          claim: 'It is caused by a production dependency.',
          supported: false,
          evidenceIds: [],
          confidence: 0.2,
        },
      ],
      factualClaimCount: 2,
      supportedClaimCount: 0,
      coverage: 0,
      diagnostics: {
        modelRole: 'CITATION_ATTRIBUTION',
        model: '@cf/test/citation',
        providerStatus: 'SUCCESS',
      },
    });

    expect(structuredLlmService.generateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        model: '@cf/test/citation',
        temperature: 0,
        timeoutMs: 4_000,
      }),
    );
  });

  it('returns full coverage when the answer contains no factual claims', async () => {
    const structuredLlmService: IStructuredLlmService = {
      generateObject: jest.fn().mockResolvedValue({ claims: [] }),
    };
    const adapter = new CloudflareCitationAttributionAdapter(
      structuredLlmService,
      createConfig(),
      aiConfig as never,
    );

    await expect(
      adapter.attribute({
        question: 'What is visible?',
        answer: 'I cannot determine that from the available evidence.',
        maxCitations: 3,
        candidates: [
          {
            evidenceId: 'e0',
            reelId: 'r1',
            evidenceType: 'VISUAL',
            evidenceText: 'A laptop is visible.',
          },
        ],
      }),
    ).resolves.toEqual({
      selections: [],
      claims: [],
      factualClaimCount: 0,
      supportedClaimCount: 0,
      coverage: 1,
      diagnostics: {
        modelRole: 'CITATION_ATTRIBUTION',
        model: '@cf/test/citation',
        providerStatus: 'SUCCESS',
      },
    });
  });
});
