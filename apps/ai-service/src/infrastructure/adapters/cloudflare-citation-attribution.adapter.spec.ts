import type { IStructuredLlmService } from '@ai/domain/interfaces/structured-llm.service.interface';
import type { ConfigService } from '@nestjs/config';
import { CloudflareCitationAttributionAdapter } from './cloudflare-citation-attribution.adapter';

describe('CloudflareCitationAttributionAdapter', () => {
  const createConfig = (values: Record<string, string> = {}) =>
    ({
      get: jest.fn((key: string) => values[key]),
    }) as unknown as ConfigService;

  it('keeps only supplied high-confidence evidence IDs', async () => {
    const structuredLlmService: IStructuredLlmService = {
      generateObject: jest.fn().mockResolvedValue({
        citations: [
          { evidenceId: 'e0', confidence: 0.92 },
          { evidenceId: 'invented', confidence: 1 },
          { evidenceId: 'e1', confidence: 0.2 },
          { evidenceId: 'e0', confidence: 0.99 },
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
        answer: 'The screen shows a module-not-found error.',
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
    ).resolves.toEqual([{ evidenceId: 'e0', confidence: 0.92 }]);

    expect(structuredLlmService.generateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        model: '@cf/meta/llama-3.1-8b-instruct',
        temperature: 0,
        timeoutMs: 4_000,
      }),
    );
  });

  it('returns an empty attribution when the model selects no evidence', async () => {
    const structuredLlmService: IStructuredLlmService = {
      generateObject: jest.fn().mockResolvedValue({ citations: [] }),
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
    ).resolves.toEqual([]);
  });
});
