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
const authStub: {
  AUTH_QUEUE: string;
  assertLoopbackRabbitUrl(value?: string): string;
} = require('./phase8-auth-stub.cjs');
const aiStub: {
  AI_QUEUE: string;
  EMBEDDING_DIMENSIONS: number;
  assertLoopbackRabbitUrl(value?: string): string;
  deterministicEmbedding(value: string): number[];
  parseDelayMs(value?: string): number;
  parseMode(value?: string): string;
} = require('./phase8-ai-stub.cjs');

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

  it('lists every required media, indexing, and query queue exactly once', () => {
    expect(inspector.QUEUES).toHaveLength(17);
    expect(new Set(inspector.QUEUES)).toHaveProperty('size', 17);
  });

  it('restricts the Phase 8 auth stub to a loopback broker', () => {
    expect(authStub.AUTH_QUEUE).toBe('auth_queue');
    expect(authStub.assertLoopbackRabbitUrl('amqp://127.0.0.1:55672')).toBe(
      'amqp://127.0.0.1:55672',
    );
    expect(() =>
      authStub.assertLoopbackRabbitUrl('amqp://rabbit.example.com'),
    ).toThrow('only accepts a loopback RabbitMQ URL');
  });

  it('restricts deterministic Phase 8 AI responses to a loopback broker', () => {
    expect(aiStub.AI_QUEUE).toBe('ai_queue');
    expect(aiStub.assertLoopbackRabbitUrl('amqp://127.0.0.1:55672')).toBe(
      'amqp://127.0.0.1:55672',
    );
    expect(() =>
      aiStub.assertLoopbackRabbitUrl('amqp://rabbit.example.com'),
    ).toThrow('only accepts a loopback RabbitMQ URL');
    expect(aiStub.parseMode(undefined)).toBe('success');
    expect(aiStub.parseMode('unavailable')).toBe('unavailable');
    expect(() => aiStub.parseMode('slow')).toThrow(
      'must be success or unavailable',
    );
    expect(aiStub.parseDelayMs(undefined)).toBe(0);
    expect(aiStub.parseDelayMs('15000')).toBe(15000);
    expect(() => aiStub.parseDelayMs('60001')).toThrow(
      'must be between 0 and 60000',
    );
    const embedding = aiStub.deterministicEmbedding('phase8');
    expect(embedding).toHaveLength(aiStub.EMBEDDING_DIMENSIONS);
    expect(embedding.every(Number.isFinite)).toBe(true);
    expect(aiStub.deterministicEmbedding('phase8')).toEqual(embedding);
  });
});
