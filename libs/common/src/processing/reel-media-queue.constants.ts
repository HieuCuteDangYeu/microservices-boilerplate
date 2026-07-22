import type { ReelMediaLengthClass } from './interfaces/reel-media-job.interface';

export type ReelMediaWorkerLane = 'SHORT' | 'LONG' | 'BOTH';

export const REEL_MEDIA_EXCHANGE = 'reel_media_jobs';
export const REEL_MEDIA_DEAD_LETTER_EXCHANGE = 'reel_media_dead_letter';

export const REEL_MEDIA_QUEUE_NAMES = {
  SHORT_JOBS: 'reel_media_short_jobs',
  LONG_JOBS: 'reel_media_long_jobs',
  SHORT_RETRY_30S: 'reel_media_short_retry_30s',
  SHORT_RETRY_5M: 'reel_media_short_retry_5m',
  SHORT_DLQ: 'reel_media_short_dlq',
  LONG_RETRY_60S: 'reel_media_long_retry_60s',
  LONG_RETRY_10M: 'reel_media_long_retry_10m',
  LONG_DLQ: 'reel_media_long_dlq',
} as const;

export const REEL_INDEX_QUEUE_NAMES = {
  SHORT_JOBS: 'reel_index_short_jobs',
  LONG_JOBS: 'reel_index_long_jobs',
} as const;

export const REEL_MEDIA_ROUTING_KEYS = {
  SHORT: 'reel.media.short',
  LONG: 'reel.media.long',
  SHORT_DLQ: 'reel.media.short.dlq',
  LONG_DLQ: 'reel.media.long.dlq',
} as const;

export interface ReelMediaPrimaryQueueDefinition {
  lengthClass: 'SHORT' | 'LONG';
  queue: string;
  routingKey: string;
  deadLetterRoutingKey: string;
}

export interface ReelMediaRetryQueueDefinition {
  lengthClass: 'SHORT' | 'LONG';
  retryNumber: 1 | 2;
  queue: string;
  delayMs: number;
  returnRoutingKey: string;
}

export interface ReelMediaDeadLetterQueueDefinition {
  lengthClass: 'SHORT' | 'LONG';
  queue: string;
  routingKey: string;
}

export const REEL_MEDIA_PRIMARY_QUEUES: readonly ReelMediaPrimaryQueueDefinition[] =
  [
    {
      lengthClass: 'SHORT',
      queue: REEL_MEDIA_QUEUE_NAMES.SHORT_JOBS,
      routingKey: REEL_MEDIA_ROUTING_KEYS.SHORT,
      deadLetterRoutingKey: REEL_MEDIA_ROUTING_KEYS.SHORT_DLQ,
    },
    {
      lengthClass: 'LONG',
      queue: REEL_MEDIA_QUEUE_NAMES.LONG_JOBS,
      routingKey: REEL_MEDIA_ROUTING_KEYS.LONG,
      deadLetterRoutingKey: REEL_MEDIA_ROUTING_KEYS.LONG_DLQ,
    },
  ];

export const REEL_MEDIA_RETRY_QUEUES: readonly ReelMediaRetryQueueDefinition[] =
  [
    {
      lengthClass: 'SHORT',
      retryNumber: 1,
      queue: REEL_MEDIA_QUEUE_NAMES.SHORT_RETRY_30S,
      delayMs: 30_000,
      returnRoutingKey: REEL_MEDIA_ROUTING_KEYS.SHORT,
    },
    {
      lengthClass: 'SHORT',
      retryNumber: 2,
      queue: REEL_MEDIA_QUEUE_NAMES.SHORT_RETRY_5M,
      delayMs: 5 * 60_000,
      returnRoutingKey: REEL_MEDIA_ROUTING_KEYS.SHORT,
    },
    {
      lengthClass: 'LONG',
      retryNumber: 1,
      queue: REEL_MEDIA_QUEUE_NAMES.LONG_RETRY_60S,
      delayMs: 60_000,
      returnRoutingKey: REEL_MEDIA_ROUTING_KEYS.LONG,
    },
    {
      lengthClass: 'LONG',
      retryNumber: 2,
      queue: REEL_MEDIA_QUEUE_NAMES.LONG_RETRY_10M,
      delayMs: 10 * 60_000,
      returnRoutingKey: REEL_MEDIA_ROUTING_KEYS.LONG,
    },
  ];

export const REEL_MEDIA_DEAD_LETTER_QUEUES: readonly ReelMediaDeadLetterQueueDefinition[] =
  [
    {
      lengthClass: 'SHORT',
      queue: REEL_MEDIA_QUEUE_NAMES.SHORT_DLQ,
      routingKey: REEL_MEDIA_ROUTING_KEYS.SHORT_DLQ,
    },
    {
      lengthClass: 'LONG',
      queue: REEL_MEDIA_QUEUE_NAMES.LONG_DLQ,
      routingKey: REEL_MEDIA_ROUTING_KEYS.LONG_DLQ,
    },
  ];

export function resolveReelMediaLengthClass(
  lengthClass: ReelMediaLengthClass,
): 'SHORT' | 'LONG' {
  return lengthClass === 'SHORT' ? 'SHORT' : 'LONG';
}

export function getReelMediaPrimaryQueue(
  lengthClass: ReelMediaLengthClass,
): ReelMediaPrimaryQueueDefinition {
  const resolved = resolveReelMediaLengthClass(lengthClass);

  return REEL_MEDIA_PRIMARY_QUEUES.find(
    (definition) => definition.lengthClass === resolved,
  )!;
}

export function getReelMediaRetryQueue(
  lengthClass: ReelMediaLengthClass,
  retryNumber: 1 | 2,
): ReelMediaRetryQueueDefinition {
  const resolved = resolveReelMediaLengthClass(lengthClass);

  return REEL_MEDIA_RETRY_QUEUES.find(
    (definition) =>
      definition.lengthClass === resolved &&
      definition.retryNumber === retryNumber,
  )!;
}

export function parseReelMediaWorkerLane(value?: string): ReelMediaWorkerLane {
  const normalized = value?.trim().toUpperCase() || 'BOTH';

  if (
    normalized === 'SHORT' ||
    normalized === 'LONG' ||
    normalized === 'BOTH'
  ) {
    return normalized;
  }

  throw new Error(
    `MEDIA_WORKER_LANE must be SHORT, LONG, or BOTH; received ${value}`,
  );
}

export function getPrimaryQueuesForWorkerLane(
  lane: ReelMediaWorkerLane,
): readonly ReelMediaPrimaryQueueDefinition[] {
  if (lane === 'BOTH') {
    return REEL_MEDIA_PRIMARY_QUEUES;
  }

  return REEL_MEDIA_PRIMARY_QUEUES.filter(
    (definition) => definition.lengthClass === lane,
  );
}
