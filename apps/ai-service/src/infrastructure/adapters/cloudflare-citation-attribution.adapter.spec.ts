import type { IStructuredLlmService } from '@ai/domain/interfaces/structured-llm.service.interface';
import type { ConfigService } from '@nestjs/config';
import { CloudflareCitationAttributionAdapter } from './cloudflare-citation-attribution.adapter';

describe('CloudflareCitationAttributionAdapter', () => {
  const createConfig = (values: Record<string, string> = {}) =>
    ({
      get: jest.fn((key: string) => values[key]),
    }) as unknown as ConfigService;

  it('keeps only supplied high-confidence evidence IDs and computes coverage', async () => {
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
      selections: [{ evidenceId: 'e0', confidence: 0.92 }],
      claims: [
        {
          claim: 'The screen shows a module-not-found error.',
          supported: true,
          evidenceIds: ['e0'],
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
      supportedClaimCount: 1,
      coverage: 0.5,
    });

    expect(structuredLlmService.generateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        model: '@cf/meta/llama-3.1-8b-instruct',
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
    });
  });
});
