# Reel pipeline Phase 2: independent media and index state

## Scope

Phase 2 separates playback readiness from semantic-index readiness, persists
rotation-aware source classification, and keeps the existing `status` field as
an explicit compatibility projection. It does not introduce the later media or
index service split.

## State model

`mediaStatus` owns playback readiness:

| State        | Meaning                                       |
| ------------ | --------------------------------------------- |
| `PENDING`    | Media work is queued.                         |
| `PROBING`    | Source metadata is being inspected.           |
| `PROCESSING` | HLS and thumbnail generation are in progress. |
| `COMPLETED`  | HLS is playable.                              |
| `FAILED`     | Media could not be made playable.             |

`indexStatus` owns semantic readiness:

| State           | Meaning                                              |
| --------------- | ---------------------------------------------------- |
| `NOT_REQUESTED` | No indexing attempt has started.                     |
| `PENDING`       | Playable media is waiting for indexing.              |
| `PROCESSING`    | Semantic enrichment is running.                      |
| `COMPLETED`     | Semantic chunks are available for retrieval.         |
| `DEGRADED`      | Media is playable without a complete semantic index. |
| `FAILED`        | Indexing failed; media remains playable.             |

Playable feeds and direct Reel responses use `mediaStatus=COMPLETED`.
Semantic chunk retrieval additionally requires `indexStatus=COMPLETED`.
`DEGRADED` remains excluded from semantic retrieval until a later phase adds an
explicit limited-retrieval path.

The legacy `status` field remains available to existing clients and is derived
by the Domain compatibility mapper. A completed media state always maps to
legacy `COMPLETED`, including when indexing is pending, degraded, or failed.
Domain interfaces use string unions and do not expose Prisma enum types.

## Source classification

ffprobe metadata is authoritative. A 90- or 270-degree rotation swaps source
width and height before calculating:

```text
sourceAspectRatio = sourceEffectiveWidth / sourceEffectiveHeight
```

- ratio at least `1.1`: `LANDSCAPE`
- ratio at most `0.9`: `PORTRAIT`
- otherwise: `SQUARE`
- duration at most `MEDIA_SHORT_MAX_DURATION_SECONDS`: `SHORT`
- longer duration: `LONG`

Unknown or invalid dimensions and durations remain unclassified instead of
being guessed.

## Attempts and persistence

Media and index work have separate `mediaAttemptId` and `indexAttemptId`
columns. Conditional updates include the applicable attempt ID, so a stale job
cannot overwrite a newer attempt. `processingAttemptId` remains populated with
the media attempt for compatibility during the transition.

The existing combined worker now persists media completion synchronously after
HLS validation and before semantic enrichment. If later enrichment fails,
Content Service records `indexStatus=FAILED` while retaining
`mediaStatus=COMPLETED` and legacy `status=COMPLETED`.

## Migration

The migration backfills media state from legacy `status`, copies the legacy
attempt ID into `mediaAttemptId`, derives effective dimensions and
classification, and marks previously completed Reels as:

- `indexStatus=COMPLETED` when at least one `ReelChunk` exists;
- `indexStatus=DEGRADED` when no semantic chunk exists.

Generate the client after changing the schema:

```sh
pnpm run prisma:generate:content
```

For a local development database only:

```sh
pnpm run migrate:dev:content
```

For an explicitly selected deployment target:

```sh
pnpm run migrate:deploy:content
```

Never run `migrate:dev:content` on a production server. Do not start Phase 2
services against a database until both the Phase 1 and Phase 2 Content
migrations have been deployed to that exact target.
