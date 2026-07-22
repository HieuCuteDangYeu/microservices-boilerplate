/**
 * TEMPORARY REFACTOR TEST
 * Remove during Phase 10 after production validation.
 */

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment */

const failureTool: {
  resolveLane(value?: string): {
    lane: 'SHORT' | 'LONG';
    routingKey: string;
    deadLetterRoutingKey: string;
  };
} = require('./failure-test-reel-queues.cjs');

const inspector: { QUEUES: string[] } = require('./inspect-reel-queues.cjs');

describe('temporary Reel queue tools', () => {
  it('selects short and long failure-test routing keys', () => {
    expect(failureTool.resolveLane('short')).toEqual({
      lane: 'SHORT',
      routingKey: 'reel.media.short',
      deadLetterRoutingKey: 'reel.media.short.dlq',
    });
    expect(failureTool.resolveLane('LONG')).toEqual({
      lane: 'LONG',
      routingKey: 'reel.media.long',
      deadLetterRoutingKey: 'reel.media.long.dlq',
    });
  });

  it('lists every required Phase 1 queue exactly once', () => {
    expect(inspector.QUEUES).toHaveLength(8);
    expect(new Set(inspector.QUEUES)).toHaveProperty('size', 8);
  });
});
