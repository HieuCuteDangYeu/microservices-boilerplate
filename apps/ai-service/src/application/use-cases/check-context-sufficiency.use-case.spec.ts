import type { IAiApplicationConfig } from '@ai/domain/interfaces/ai-application-config.interface';
import type { RagChatWorkflowState } from '@ai/domain/interfaces/rag-chat-workflow.interface';
import { CheckContextSufficiencyUseCase } from './check-context-sufficiency.use-case';

describe('CheckContextSufficiencyUseCase', () => {
  const config = {
    model: jest.fn(() => '@cf/test/sufficiency'),
    timeoutMs: jest.fn(() => 6_000),
    maxCompletionTokens: jest.fn(() => 512),
  } as unknown as IAiApplicationConfig;

  const state = (input: {
    requiredEvidence?: Array<'TRANSCRIPT' | 'VISUAL' | 'AUDIO' | 'METADATA'>;
    evidenceType?: 'TRANSCRIPT' | 'VISUAL' | 'METADATA';
    evidenceText?: string;
  }): RagChatWorkflowState =>
    ({
      userMessage: 'What semantic relation is asserted?',
      route: {
        needsRetrieval: true,
        requiredEvidence: input.requiredEvidence ?? ['TRANSCRIPT'],
      },
      rerankedChunks: input.evidenceText
        ? [
            {
              evidenceType: input.evidenceType ?? 'TRANSCRIPT',
              evidenceText: input.evidenceText,
              chunkText: input.evidenceText,
              tags: [],
            },
          ]
        : [],
    }) as unknown as RagChatWorkflowState;

  it('refuses deterministically when no evidence exists', async () => {
    const service = { generateObject: jest.fn() };
    const useCase = new CheckContextSufficiencyUseCase(
      service as never,
      config,
    );

    await expect(useCase.execute(state({}))).resolves.toMatchObject({
      sufficient: false,
      missingEvidence: ['TRANSCRIPT'],
      recommendedAction: 'REFUSE_NO_CONTEXT',
      diagnostics: { decisionSource: 'DETERMINISTIC_NO_CONTEXT' },
    });
    expect(service.generateObject).not.toHaveBeenCalled();
  });

  it('refuses deterministically when the required modality is absent', async () => {
    const service = { generateObject: jest.fn() };
    const useCase = new CheckContextSufficiencyUseCase(
      service as never,
      config,
    );

    await expect(
      useCase.execute(
        state({
          requiredEvidence: ['VISUAL'],
          evidenceType: 'TRANSCRIPT',
          evidenceText: 'A speaker discusses a glyph.',
        }),
      ),
    ).resolves.toMatchObject({
      sufficient: false,
      missingEvidence: ['VISUAL'],
      diagnostics: { decisionSource: 'DETERMINISTIC_REQUIRED_MODALITY' },
    });
    expect(service.generateObject).not.toHaveBeenCalled();
  });

  it.each([
    ['supports an unseen relation', true, 'ANSWER'],
    ['contains only a nearby topic', false, 'REFUSE_NO_CONTEXT'],
  ])(
    'uses the semantic decision when evidence %s',
    async (_description, sufficient, recommendedAction) => {
      const service = {
        generateObject: jest.fn().mockResolvedValue({
          sufficient,
          confidence: 0.87,
          availableEvidence: ['TRANSCRIPT'],
          missingEvidence: sufficient ? [] : ['TRANSCRIPT'],
          supportedEvidenceIds: sufficient ? ['e0'] : [],
          reason: 'Semantic evidence judgment.',
          userFacingReason: sufficient ? '' : 'The relation is unsupported.',
          recommendedAction,
        }),
      };
      const useCase = new CheckContextSufficiencyUseCase(
        service as never,
        config,
      );

      await expect(
        useCase.execute(
          state({ evidenceText: 'A novel relation appears in this passage.' }),
        ),
      ).resolves.toMatchObject({
        sufficient,
        supportedEvidenceIds: sufficient ? ['e0'] : [],
        diagnostics: { providerStatus: 'SUCCESS', decisionSource: 'LLM' },
      });
      expect(service.generateObject).toHaveBeenCalledWith(
        expect.objectContaining({
          model: '@cf/test/sufficiency',
          timeoutMs: 6_000,
          temperature: 0,
          schemaVersion: 'context-sufficiency-v2',
        }),
      );
      const schema = service.generateObject.mock.calls[0][0].jsonSchema;
      expect(schema.required).not.toEqual(
        expect.arrayContaining(['availableEvidence', 'missingEvidence']),
      );
      expect(schema.properties).toMatchObject({
        confidence: { minimum: 0, maximum: 1 },
        supportedEvidenceIds: { maxItems: 8 },
        reason: { maxLength: 400 },
        userFacingReason: { maxLength: 300 },
      });
    },
  );

  it('filters provider evidence IDs that were not supplied', async () => {
    const service = {
      generateObject: jest.fn().mockResolvedValue({
        sufficient: true,
        confidence: 1,
        availableEvidence: ['TRANSCRIPT'],
        missingEvidence: [],
        supportedEvidenceIds: ['e0', 'e99'],
        reason: 'Supported.',
        userFacingReason: '',
        recommendedAction: 'ANSWER',
      }),
    };
    const useCase = new CheckContextSufficiencyUseCase(
      service as never,
      config,
    );

    await expect(
      useCase.execute(state({ evidenceText: 'Authorized evidence.' })),
    ).resolves.toMatchObject({ supportedEvidenceIds: ['e0'] });
  });

  it('fails closed when the semantic provider is unavailable', async () => {
    const service = {
      generateObject: jest.fn().mockRejectedValue(new Error('down')),
    };
    const useCase = new CheckContextSufficiencyUseCase(
      service as never,
      config,
    );

    await expect(
      useCase.execute(state({ evidenceText: 'Potential evidence.' })),
    ).resolves.toMatchObject({
      sufficient: false,
      confidence: 0,
      supportedEvidenceIds: [],
      diagnostics: { providerStatus: 'ERROR', decisionSource: 'FAIL_CLOSED' },
    });
  });
});
