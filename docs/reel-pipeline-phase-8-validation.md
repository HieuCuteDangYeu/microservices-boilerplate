# Reel pipeline Phase 8 validation

Validated on 2026-07-22 against disposable local infrastructure. The local
environment used an isolated RabbitMQ broker, MinIO bucket, Content PostgreSQL
database, and pgvector PostgreSQL database. It did not write to the configured
shared remote Content database.

## Result

- Local validation: complete.
- Staging validation: explicitly waived by the owner on 2026-07-22 in favor of
  proceeding to the production canary phase.
- Production canary validation: not started; this belongs to Phase 9.

## Scenario matrix

| Scenario | Local evidence | Result |
| --- | --- | --- |
| Short portrait | API upload completed; source and output classified portrait with three variants. | Pass |
| Short landscape | API upload completed; source and output classified landscape with three variants. | Pass |
| Short square | API upload completed; source and output classified square with three variants. | Pass |
| Rotated portrait | API upload completed; rotation 90 produced portrait output. | Pass |
| No-audio short | API upload completed with `sourceHasAudio=false`. | Pass |
| Five concurrent short uploads | Corrected SHORT-only worker completed 5/5; p50 24.133 s, p95/max 40.253 s. | Pass |
| Ten concurrent short uploads | Corrected SHORT-only worker completed 10/10 with a 15-second client duration hint; p50 40.353 s, p95/max 78.608 s. | Pass |
| Two concurrent long uploads | Two 181-second uploads completed 2/2; p50 217.361 s and p95/max 257.521 s, including queue wait while the disposable image was rebuilt. | Pass |
| Short while long transcode active | A short upload completed in 12.295 s while a separate 30-minute FFmpeg process remained active at about one CPU. | Pass |
| Worker restart during HLS | Runtime restart initially exposed permanent shutdown failure handling. The fix now marks only service-shutdown process interruption retryable; a restarted 181-second job completed with its original attempt ID. | Pass |
| Worker restart during transcription | Runtime checkpoint observed `TRANSCRIBING_AUDIO_SEGMENTS` and a `PROCESSING` segment; after worker restart, the same index attempt completed. | Pass |
| Duplicate media job | Exact outbox payload redelivered; worker logged `claimed=false`, ignored the stale attempt, and did not change the media attempt or HLS key. | Pass |
| Duplicate index job | Exact completed index job redelivered; queue drained and active document/chunk counts remained one each. | Pass |
| AI Service unavailable | Loopback stub returned immediate unavailable errors. The checkpoint failed durably, the job entered bounded retry queues, and completed media/HLS stayed intact. | Pass |
| Indexing Service unavailable | With indexing consumers stopped, media continued to complete and index jobs remained durable; service recovery restored consumers. Fallback behavior is covered by temporary tests. | Pass |
| RabbitMQ reconnect | Disposable workers lost and restored broker connectivity; consumers recovered without an unbounded unacknowledged backlog. | Pass |
| Reel deleted during indexing | An index job was queued, the Reel was deleted through the local API, and the job drained as stale with zero checkpoint/document/section/chunk rows. | Pass |
| Reprocess media only | Failed synthetic Reel moved to completed media with a new media attempt and HLS output, then created a separate pending index attempt. | Pass |
| Reindex only | Reindex created a new index attempt while the media attempt and HLS key remained unchanged. | Pass |
| HNSW search | Real pgvector seed/search returned the expected Reel, section, and chunk. `EXPLAIN` used the embedding HNSW index; hybrid text search used the GIN index. | Pass |
| RAG over long-video section | Deterministic long hierarchy produced 24 sections and 216 chunks; section-scoped retrieval behavior passed the temporary RAG tests. | Pass |
| Semantic recommendation | Real semantic repository search passed; recommendation adapter tests confirmed semantic candidates and safe omission when indexing is unavailable. | Pass |

## Fairness evidence

The final fairness run used explicit lane settings matching Compose:
`MEDIA_WORKER_LANE=SHORT` and `MEDIA_WORKER_LANE=LONG`.

- Each primary queue had exactly one lane-specific consumer.
- After the short completed, the short queue had 0 ready and 0 unacknowledged
  messages while the long queue had 0 ready and 1 unacknowledged message.
- The long FFmpeg process was still active at about 100% of one CPU and about
  352 MiB when the short result was recorded.
- `MEDIA_FFMPEG_THREADS_PER_VARIANT=1` bounded x264 resource use independently
  for each output variant. A long three-variant process stayed around one CPU
  instead of exhausting the Docker VM.
- The interrupted fairness probe ended as `PENDING / RETRY_SCHEDULED`, not
  failed, and its one disposable queued message was removed after evidence was
  captured.

## Performance and database evidence

- A deterministic 7,200-second hierarchy with 720 transcript segments produced
  24 sections, 216 chunks, and 241 semantic documents in about 28 ms, using
  eight embedding batches.
- Real pgvector search p95 was 3.29 ms for long documents, 2.75 ms for sections,
  2.70 ms for chunks, and 3.09 ms for filtered search; recall@20 was 1.0.
- The isolated pgvector database ran pgvector 0.8.5 with all Reel Indexing
  migrations applied.
- The isolated Content database applied all 21 Content migrations.
- HLS inspection of the restarted long landscape Reel preserved 640x360
  geometry and reported `landscapeCroppingObserved=false`.

## Automated verification

- `pnpm run tmp:test:reel-upgrade`: 24 suites, 128 tests passed.
- `pnpm run build:all`: all 15 service builds passed.
- Targeted ESLint: no errors in changed TypeScript files.
- `node --check`: all changed operational and temporary CommonJS scripts passed.
- Temporary tests and diagnostics remain tracked for Phase 10 cleanup.

## Staging disposition

The configured remote Content database now reports all 21 migrations applied.
A read-only Prisma smoke query also confirmed that the outbox table and split
media/index status columns are usable.

The Reel Indexing database URL is now configured and accepts read-only runtime
connections, but its `public` schema is empty: pgvector is not installed and no
indexing tables exist. `prisma migrate status` also returns a schema-engine error
against its pooled Prisma host, so migrations require a direct
migration-capable database URL rather than raw DDL that would bypass migration
history.

The only configured HTTP backend is `https://velora-app.me`, which the owner
confirmed is production. There is no separate `STAGING_API_URL` or
`REEL_LOAD_TEST_API_URL`. The owner explicitly directed validation to continue
in production over SSH, so the missing staging pass is recorded as a waiver
rather than represented as completed. Production database preparation and
canary evidence belong to Phase 9.
