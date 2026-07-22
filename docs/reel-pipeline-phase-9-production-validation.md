# Reel pipeline Phase 9 production validation

Validated on 2026-07-22 against `https://velora-app.me` and production host
`velora-server`. The owner explicitly authorized direct production validation
over SSH after waiving a separate staging pass in Phase 8.

## Result

- Production migrations, pgvector, HNSW indexes, RabbitMQ topology, and worker
  isolation: pass.
- Short portrait and short landscape canaries: pass at concurrency 1.
- Thirty-minute landscape canary: pass on the initial artifact; authoritative
  corrected-image rerun recorded below.
- No load test above concurrency 1 was run in production.

## Baseline and rollback capture

- Deployment directory: `/var/www/microservices`.
- Initial source checkout: `944084821f0fb23833bf3870e7a14f481c505b83`
  with a clean worktree.
- Compose checksum:
  `89e6e13d5a4b549c193b1fad4909919bd358e13dc52d8cf49ac0ba3af7939124`.
- Host capacity: 2 CPUs, 3,915 MiB RAM, 4,095 MiB swap, and 82 GiB free
  disk before the rollout.
- RabbitMQ reported healthy before mutation. Reel queues were empty.
- Rollback tags were created before each image switch:
  `rollback-phase7-9440848` for API Gateway, AI Service, Reel Indexing, and
  Media Processing. The earlier media artifact also remains tagged
  `phase8-196f25e`.
- RabbitMQ queues and database records were preserved throughout the rollout.

## Database readiness

- Content database: 21 migrations found; schema up to date.
- Reel Indexing database: 3 migrations found; schema up to date.
- pgvector: 0.8.1.
- HNSW indexes present:
  `ReelDocument_embedding_hnsw_idx`, `ReelSection_embedding_hnsw_idx`, and
  `ReelChunk_embedding_hnsw_idx`.
- Initial Content counts: 69 completed Reels, 4 failed Reels, and 0 pending
  outbox events.
- The semantic index was empty before the production canaries.

## Production faults found and repaired

1. Both indexing workers were crash-looping because their containers predated
   the server's `REEL_INDEXING_DATABASE_URL` update. Recreating one lane at a
   time restored both workers without changing the image or database.
2. The long media worker had never been created, leaving
   `reel_media_long_jobs` with zero consumers. It was started and the deployment
   workflow now pairs `media-processing-long-service` with every base media
   worker deployment.
3. A successful Cloudflare transcription response with no spoken text was
   treated as a failure. Empty transcripts are now valid, allowing metadata-only
   semantic indexing. A provider RPC error's `message` is also preserved instead
   of becoming `[object Object]`.
4. The Gateway received `mediaStatus` and `indexStatus` from Content but omitted
   them from `GET /content/reels/:id/status`. Both additive fields are now
   returned, preventing clients and canary tooling from confusing media-ready
   with index-ready.
5. The production canary exposed the 15-minute access-token boundary for long
   jobs. The temporary runner now refreshes tokens in memory via the existing
   refresh cookie, never printing or persisting credentials.
6. The first transferred media image was older than the final Phase 8 commit.
   Process inspection caught the missing thread arguments. A fresh image was
   built from the committed source and verified both statically and in the live
   FFmpeg command before it became the authoritative artifact.

## Deployed image evidence

| Service | Production image ID | Verification |
| --- | --- | --- |
| API Gateway | `42d84f43c22dd75edd33b64aeb72f23b3741f139880cf56c239c1edcbb8f04a1` | Status endpoint returns media and index states. |
| AI Service | `d64ea7bb77c79c5a63c4dd6e92b1d65b06f3ce5d6c09ac778558ad3ca72382c5` | Successful empty transcript accepted. |
| Reel Indexing, both lanes | `2a7ef4dd291bf581f0d043e85af8fdfe7a8146aa62fc88d1f5f3ed86d8f777f1` | Both consumers stable; structured RPC errors retained. |
| Media Processing, both lanes | `4a0bbe536386d12eed3449dfcdd07664103960eb115b1313bf14c88ff213f024` | Live FFmpeg uses `-threads:v:0 2`, `-threads:v:1 2`, and `-threads:v:2 2`. |

All five Reel/AI worker containers reported restart count 0 after their final
recreation.

## Canary evidence

| Scenario | Reel ID | Production evidence | Result |
| --- | --- | --- | --- |
| Short portrait | `382a4384-5c20-49a6-a8e0-39514cae0015` | 15,000 ms, 1080x1920, `PORTRAIT`, three variants, HLS, thumbnail, audio manifest, one active Reel document and one active chunk. Reprocessed successfully on the corrected media image. | Pass |
| Short landscape | `18e7514d-190e-46ef-b1ff-445f60bbd411` | 15,000 ms, 1920x1080, `LANDSCAPE`; variants are 640x360, 960x540, and 1280x720. HLS, thumbnail, audio manifest, one active Reel document and one active chunk. Reprocessed successfully on the corrected media image. | Pass |
| Long landscape | `505fc118-1ba4-446a-8ab9-85061e4f3681` | 1,800,000 ms, 1920x1080, `LONG` and `LANDSCAPE`; correctly isolated to the long queues. The corrected-image run reached media and index `COMPLETED` in 1,344,489 ms. | Pass |

The initial portrait canary intentionally produced one short-index DLQ message
while exposing the empty-transcript defect. The same private Reel was reprocessed
successfully; the diagnostic DLQ message was preserved rather than destructively
purged.

## Operational observations

- The corrected 30-minute encode remained within the two-core worker envelope;
  the live FFmpeg process showed explicit per-variant thread limits. It used
  about 134-179% CPU and about 299-359 MiB RAM during observed samples.
- During long processing, the short lane remained independently available and
  every primary Reel queue retained exactly one consumer.
- The production HLS master was fetched successfully and advertised 640x360,
  960x540, and 1280x720 landscape variants. The thumbnail returned HTTP 200.
- `index.get_reel_document` returned the active 384-dimensional semantic Reel
  document. A scoped `index.search_reels` query returned the same long canary.
- The personalized recommendation endpoint returned 50 eligible public items
  using `personalized-ranker-v1`; none of the three private canaries appeared.
- The refreshed long poll crossed the 15-minute access-token boundary and
  completed without a 401 response or persisted credential material.
- The Node 20 containers emit an AWS SDK notice that releases after the first
  week of January 2027 will require Node 22. This warning did not affect the
  rollout but should be scheduled before that support boundary.

## Automated verification

- Focused Jest: 3 suites and 18 tests passed for transcription, checkpoint
  error handling, and canary tooling; the runner suite later passed 5 tests
  after token-refresh support was added.
- AI Service, Reel Indexing Service, and API Gateway production builds passed.
- Targeted ESLint passed for all changed TypeScript files.
- `git diff --check` passed.

## Final post-rollout snapshot

- 72 completed Reels and 4 unchanged historical failed Reels.
- 0 active media jobs, 0 active index jobs, and 0 unpublished outbox events.
- The three canaries have 3 active Reel documents and 3 active chunks. Their
  no-speech fixtures correctly produced 0 sections.
- All Reel, AI, Content, Gateway, and RabbitMQ containers reported running with
  restart count 0.
- Every short/long primary queue had one consumer; all retry and media/long
  DLQ depths were zero.
- `reel_index_short_dlq` retained the one diagnostic message created by the
  initial failed canary. It was deliberately preserved.
- Final host state: load 0.12/1.52/2.94, 1,433 MiB memory available, and 77 GiB
  disk free.
- The four temporary image-transfer archives were deleted from both local and
  production `/tmp`. Deployed and rollback image tags remain available.

Phase 9 passes. Phase 10 may begin after this report and the Phase 9 fixes are
reviewed and committed.
