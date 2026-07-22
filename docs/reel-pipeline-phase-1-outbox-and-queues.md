# Reel pipeline Phase 1: transactional outbox and media lanes

## Scope

Phase 1 closes the Content database-to-RabbitMQ publish gap and splits media
work into independent short and long queues. It does not create Indexing
Service consumers. The future queue names `reel_index_short_jobs` and
`reel_index_long_jobs` are reserved in the shared queue constants only.

The Nest application is still named `processing-service`, so the existing
`start:processing` and `build:processing` package scripts remain canonical in
this phase. A later phase may rename the app and add the
`start:media-processing` and `build:media-processing` names together.

## Durable creation flow

1. Content Service validates that the uploaded media object exists.
2. It assigns the Reel ID, media-attempt ID, and job ID.
3. The trusted client-observed duration hint classifies the job as `SHORT`,
   `LONG`, or conservatively `UNKNOWN`. Unknown work uses the long lane.
4. Reel and `OutboxEvent` are written in the same Prisma transaction.
5. The dispatcher claims committed events with `FOR UPDATE SKIP LOCKED` and a
   claim token, then publishes persistent messages using publisher confirms.
6. A failed publish clears the claim and schedules an exponential retry. A
   stale dispatcher claim can be recovered by another Content replica.
7. ffprobe metadata remains authoritative. The media worker reclassifies the
   source and enforces the configured long-video ceiling before transcoding.

## RabbitMQ topology

| Lane  | Primary queue           | Retry 1                      | Retry 2                     | Dead-letter queue      |
| ----- | ----------------------- | ---------------------------- | --------------------------- | ---------------------- |
| Short | `reel_media_short_jobs` | `reel_media_short_retry_30s` | `reel_media_short_retry_5m` | `reel_media_short_dlq` |
| Long  | `reel_media_long_jobs`  | `reel_media_long_retry_60s`  | `reel_media_long_retry_10m` | `reel_media_long_dlq`  |

Primary queues are durable and dead-letter permanent failures. Retry queues
use TTL plus dead-letter routing back to their primary lane. Media messages are
persistent. Consumers use manual acknowledgements with prefetch 1.

Production should run separate containers:

- `processing-service`: `MEDIA_WORKER_LANE=SHORT`
- `processing-long-service`: `MEDIA_WORKER_LANE=LONG`

`MEDIA_WORKER_LANE=BOTH` is supported for local or transitional deployments,
but each lane still receives a separate Nest application context and local
concurrency limiter.

## Delivery and acknowledgement rules

- Success is acknowledged only after Content Service durably persists the
  completed result through a request/response RabbitMQ call.
- A crash or persistence failure before durable result handling requeues the
  original delivery.
- A redelivery after durable completion is stale and is acknowledged without
  repeating processing.
- Transient failures are durably marked `RETRY_SCHEDULED`; the worker confirms
  publication to the next retry queue before acknowledging the current job.
- Permanent or retry-exhausted failures are durably recorded, then rejected to
  the lane DLQ.
- Duplicate or stale media-attempt IDs cannot update a newer Reel attempt.

## Configuration

```dotenv
MEDIA_SHORT_MAX_DURATION_SECONDS=180
MEDIA_LONG_MAX_DURATION_SECONDS=7200
MEDIA_WORKER_LANE=SHORT
MEDIA_WORKER_PREFETCH=1
OUTBOX_DISPATCH_BATCH_SIZE=25
OUTBOX_CLAIM_STALE_MS=60000
```

The duration hint only selects a queue. It never bypasses ffprobe validation.

## Migration and diagnostics

Apply the Content migration before starting a Phase 1 Content Service:

```sh
pnpm exec prisma migrate deploy --schema=apps/content-service/prisma/schema.prisma
```

Inspect all eight queues without consuming jobs:

```sh
pnpm run tmp:inspect:reel-queues
```

Verify malformed-message dead-letter routing with a temporary observer queue:

```sh
REEL_QUEUE_FAILURE_TEST_LANE=SHORT pnpm run tmp:failure-test:reel-queues
REEL_QUEUE_FAILURE_TEST_LANE=LONG pnpm run tmp:failure-test:reel-queues
```

The failure diagnostic does not consume the permanent DLQ. Temporary tools and
tests are registered in `docs/reel-pipeline-temporary-artifacts.md` for Phase
10 review.
