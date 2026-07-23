# Reel pipeline Phase 10 cleanup

Completed on 2026-07-23 after Phase 9 passed. Cleanup commit `6b8eb30`
removed the temporary upgrade surface; final validation used
`https://velora-app.me`.

## 1. Temporary Jest files deleted

Deleted 24 refactor-only Jest files: the 23 temporary tests recorded in the
original manifest plus the Phase 9 Cloudflare transcription regression spec.
No pre-Phase-0 test was deleted.

## 2. Temporary scripts deleted

Deleted all 13 files under `scripts/tmp` (11 diagnostic programs and two Jest
specs). No test-only fixture, helper, or additional Jest configuration remained.

## 3. Package scripts deleted

Deleted 17 `tmp:*` commands and the obsolete `backfill:reel-chunks` command.
The legacy backfill handler, use case, and its isolated repository methods were
also removed because the new reindex path replaces that one-time operation.

## 4. Stable package scripts retained

Retained the media-processing and Reel-indexing development, production,
build, Prisma generation, migration, and Studio commands. Retained
`ops:reindex:reel` and `ops:reindex:status`: both are documented in the Phase 5
runbook, require an explicit Reel ID, and use the production Content Service
boundary.

## 5. Dependencies removed

The direct-process FFmpeg refactor had already removed `fluent-ffmpeg`,
`@types/fluent-ffmpeg`, `@ffmpeg-installer/ffmpeg`, and
`@ffprobe-installer/ffprobe` from `package.json` and `pnpm-lock.yaml`. Phase 10
confirmed there are no repository references or installed dependency reasons
for those packages. The frozen lockfile required no further dependency change.

## 6. Dependencies retained and why

Retained Jest, ts-jest, `@types/jest`, `@nestjs/testing`, and supertest because
unrelated pre-existing Call, Conversation, and Notification tests still use
them. Retained LangGraph because conversational RAG still depends on it.

## 7. Remaining pre-refactor tests

- `apps/call-service/test/e2e/call-flow.e2e.spec.ts`
- `apps/call-service/test/unit/application/call-lifecycle.use-case.spec.ts`
- `apps/call-service/test/unit/infrastructure/call.gateway.spec.ts`
- `apps/conversation-service/src/infrastructure/repositories/prisma-chat.repository.spec.ts`
- `apps/notification-service/src/firebase-admin/dev-push.controller.spec.ts`
- `apps/notification-service/src/push-notifications/push-notifications.service.spec.ts`

The CallGateway unit helper was aligned with the current constructor contract;
the test behavior and coverage remain intact.

## 8. Final package.json

`package.json` contains no `tmp:*`, `start:processing`, `build:processing`, or
legacy Reel-chunk backfill command. The Call E2E command now points to its
existing `test/e2e` path. `studio:content` uses the explicit Content Prisma
schema path.

## 9. Final aggregate scripts

- `start:all` includes `media-processing-service` and
  `reel-indexing-service`, with no deleted Processing Service.
- `build:all` includes both replacement services, with no deleted Processing
  Service.
- `prisma:generate:all` includes Content and Reel Indexing generation.

## 10. Final local validation

- `pnpm install --frozen-lockfile`: passed; lockfile was already current.
- `pnpm prisma:generate:all`: passed for all ten Prisma schemas.
- `pnpm lint`: passed repository-wide.
- `pnpm build:all`: passed for all 15 services.
- `pnpm test -- --runInBand`: 6 suites and 44 tests passed.
- `pnpm test:e2e`: 1 suite and 14 tests passed in a fresh process.
- `git diff --check`: passed.

The lint command now ignores generated Prisma declarations, applies
Jest-appropriate false-positive rules only to spec files, and includes narrow
type-safety fixes for existing Call and Notification code.

## 11. Final production smoke

| Scenario | Reel ID | Result |
| --- | --- | --- |
| Short portrait | `154301ed-a3d6-45bd-98b0-193b63fe34ad` | Media and index `COMPLETED`; `PORTRAIT`; 15,000 ms; HLS 200; thumbnail 200. |
| Short landscape | `e78666bd-c1f7-46b8-aac6-07570fe6c15c` | Media and index `COMPLETED`; `LANDSCAPE`; 15,000 ms; HLS 200; thumbnail 200. |

Both private canaries have active 384-dimensional Reel documents. A filtered
semantic search for their unique Phase 10 tag returned exactly both Reel IDs.

The smoke exposed five unacknowledged query RPC messages: two older Phase 9
reads plus the three Phase 10 reads. The query-only listener used manual
acknowledgement even though its request/response controller did not acknowledge
messages. Job lanes remain manual-ack; the query listener now uses automatic
acknowledgement. Production short indexing image
`2454e2c177d3ef8179f3d50c1b35f8f48cac233009a3b39f50c4cab1023fda59`
was deployed with rollback tag `rollback-phase10-prequeryack`.

After deployment, repeated document and filtered-search RPCs still returned
both canaries, and `reel_index_query` remained at 0 ready, 0 unacknowledged,
and 1 consumer. All media/index job and retry queues were empty; the single
intentional Phase 9 short-index DLQ diagnostic remained untouched. Relevant
workers were running with restart count 0. Local and production transfer
archives were deleted.

## 12. Git status and diff summary

Cleanup commit `6b8eb30` removed 5,351 lines across 41 files. The final Phase 10
closure adds the validation record, lint/test maintenance, and the production
query-ack fix. The final worktree is verified after the closure commit.
