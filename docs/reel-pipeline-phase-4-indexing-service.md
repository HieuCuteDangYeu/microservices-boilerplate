# Reel pipeline Phase 4: dedicated indexing service

## Scope

`reel-indexing-service` consumes the durable media output contract and owns
long-form transcription, deterministic transcript merging, metadata extraction,
checkpointed chunk construction, embedding, validation, and guarded persistence
through Content Service. RabbitMQ carries storage keys and metadata only.

Phase 4 intentionally keeps the existing single-item embedding API. Phase 5 is
responsible for hierarchical Reel/section/chunk documents and batch embeddings.

## Runtime and queue lanes

Run short and long workers from the same image with separate consumers:

- `reel-indexing-service`: `INDEX_WORKER_LANE=SHORT`
- `reel-indexing-long-service`: `INDEX_WORKER_LANE=LONG`

Defaults:

```dotenv
INDEX_SHORT_PREFETCH=4
INDEX_LONG_PREFETCH=1
INDEX_TRANSCRIPTION_CONCURRENCY=2
INDEX_EMBEDDING_CONCURRENCY=4
INDEX_SEGMENT_MAX_ATTEMPTS=3
```

The direct exchange `reel_index_jobs` routes to `reel_index_short_jobs` and
`reel_index_long_jobs`. Each lane has two TTL retry queues and an independent
DLQ on `reel_index_dead_letter`.

## Durable checkpoints

The indexing database records job stage and per-audio-segment state. Segment
records include segment number, artifact checksum, provider, model, version,
status, attempt count, transcript text, and timestamped transcript segments.
Completed segments are not sent to AI Service again after a retry or restart.

The persisted stages are:

```text
TRANSCRIBING_AUDIO_SEGMENTS
MERGING_TRANSCRIPT
EXTRACTING_METADATA
BUILDING_SECTIONS
BUILDING_CHUNKS
EMBEDDING
VALIDATING
PERSISTING
```

Content Service claims and persists by `indexAttemptId`, so an obsolete worker
cannot replace transcript metadata or chunks belonging to a newer attempt.

## Transcript and metadata behavior

Timestamped segment output is offset by the artifact start time, ordered by
segment number, checked for missing segments, and reconciled only when artifact
timestamps overlap. Duplicate text detection uses normalized suffix/prefix
similarity rather than exact equality.

Long transcripts are split into bounded sections. Each section is summarized,
then the bounded summaries are used for final metadata extraction. Strong user
metadata skips LLM metadata generation. Reels without an audio manifest skip
transcription and can still index their user metadata.

## Database migration

Phase 4 adds a dedicated schema and migration under
`apps/reel-indexing-service/prisma`. Apply it only after explicitly selecting
and confirming the target database:

```sh
pnpm run migrate:deploy:reel-indexing
```

Phase 4 verification generates and validates the Prisma client but does not
apply the migration.

## Commands

```sh
pnpm start:reel-indexing
pnpm run build:reel-indexing
pnpm run start:prod:reel-indexing
pnpm run prisma:generate:reel-indexing
pnpm run studio:reel-indexing
```

## Verification

```sh
pnpm test -- --runInBand \
  apps/reel-indexing-service/src/application/use-cases/reel-indexing.phase4.spec.ts \
  apps/content-service/src/application/use-cases/dispatch-outbox-events.use-case.spec.ts \
  apps/content-service/src/infrastructure/repositories/content.repository.phase2.spec.ts
pnpm run build:reel-indexing
pnpm run build:content
pnpm run build:ai
```

The focused suite covers one segment, ordered and out-of-order segments,
segment retry, overlap removal, missing segments, restart resume, hierarchical
metadata, strong-metadata LLM bypass, and a no-audio job.
