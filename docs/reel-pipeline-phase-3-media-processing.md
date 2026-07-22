# Reel pipeline Phase 3: dedicated media processing

## Scope

`media-processing-service` is a media-only worker. It downloads and probes the
source, validates it, produces aspect-safe HLS and a thumbnail, creates
segmented transcription-audio artifacts, validates the uploaded stream, and
persists a compact durable output contract through Content Service.

It does not call transcription or metadata models, chunk text, create
embeddings, persist vectors, or run a LangGraph indexing workflow.

## Runtime and lanes

Run short and long workers from the same image with independent queue lanes:

- `media-processing-service`: `MEDIA_WORKER_LANE=SHORT`
- `media-processing-long-service`: `MEDIA_WORKER_LANE=LONG`

The stable local and production commands are:

```sh
pnpm start:media-processing
pnpm build:media-processing
pnpm start:prod:media-processing
```

The Docker image pins Debian Bullseye FFmpeg `7:4.3.9-0+deb11u2`. Runtime
processes use `node:child_process.spawn` with argument arrays, bounded output,
duration-derived timeouts, cancellation, and shutdown termination.

## Configuration defaults

```dotenv
MEDIA_SHORT_HLS_SEGMENT_SECONDS=2
MEDIA_LONG_HLS_SEGMENT_SECONDS=4
MEDIA_SHORT_MAX_DURATION_SECONDS=180
MEDIA_LONG_MAX_DURATION_SECONDS=7200
MEDIA_ALLOW_1080P=false
MEDIA_ALLOW_60FPS=false
MEDIA_TRANSCRIPTION_SEGMENT_SECONDS=300
MEDIA_TRANSCRIPTION_SEGMENT_OVERLAP_SECONDS=2
MEDIA_TRANSCRIPTION_AUDIO_FORMAT=wav
```

Portrait, landscape, and square ladders use the orientation-independent names
`360p`, `540p`, `720p`, and optional `1080p`. Variants never exceed the
effective rotated source dimensions. HLS filters scale down to fit, make
dimensions even, pad when the exact canvas is needed, and never crop normal
outputs.

## Durable completion contract

Content Service stores the HLS master key, thumbnail key, transcription-audio
manifest key, actual variant dimensions, source length class, object counts,
byte totals, and checksums. The media delivery is acknowledged only after that
attempt-guarded update succeeds. RabbitMQ messages contain keys and metadata,
never audio bytes.

Apply the new Content migration only after selecting and confirming the target
database:

```sh
pnpm exec prisma migrate deploy --schema=apps/content-service/prisma/schema.prisma
```

No migration is applied automatically by the media worker or by Phase 3
verification.

## Verification

```sh
pnpm run tmp:test:reel-pipeline
pnpm run build:media-processing
pnpm run build:content
pnpm run build:gateway
```

The temporary Phase 3 suite generates no large fixtures. It verifies accepted
orientations, rotation, no-audio and VFR sources, 24/25/30/50/60 FPS, the
configured two-hour boundary, validation failures, generated FFmpeg argument
arrays, six-digit segment names, and long-form audio overlap planning.
