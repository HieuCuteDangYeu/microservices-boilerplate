import { AiApplicationConfigAdapter } from './ai-application-config.adapter';

describe('AiApplicationConfigAdapter verifier token budgets', () => {
  it('uses the empirically selected role defaults', () => {
    const config = { get: jest.fn().mockReturnValue(undefined) };
    const adapter = new AiApplicationConfigAdapter(config as never);

    expect(adapter.verifierMaxTokens('VERIFIER')).toBe(650);
    expect(adapter.verifierMaxTokens('VERIFIER_ESCALATION')).toBe(1_024);
  });

  it('reads independent primary and escalation budgets', () => {
    const values: Record<string, string> = {
      AI_VERIFIER_MAX_TOKENS: '700',
      AI_VERIFIER_ESCALATION_MAX_TOKENS: '1200',
    };
    const config = {
      get: jest.fn((key: string) => values[key]),
    };
    const adapter = new AiApplicationConfigAdapter(config as never);

    expect(adapter.verifierMaxTokens('VERIFIER')).toBe(700);
    expect(adapter.verifierMaxTokens('VERIFIER_ESCALATION')).toBe(1_200);
  });

  it.each(['127', '4097', 'not-a-number'])(
    'rejects invalid configured budgets (%s)',
    (value) => {
      const config = { get: jest.fn().mockReturnValue(value) };
      const adapter = new AiApplicationConfigAdapter(config as never);

      expect(() => adapter.verifierMaxTokens('VERIFIER')).toThrow(
        'Invalid AI_VERIFIER_MAX_TOKENS',
      );
    },
  );
});
