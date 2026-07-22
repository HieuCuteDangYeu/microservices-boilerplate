# Reel pipeline Phase 0 baseline

## Scope

Phase 0 measures the existing combined `processing-service` without changing
its validation, encoding, retry, or completion behavior. Structured log records
use `event: "reel_pipeline_metric"` and always include `reelId`,
`processingAttemptId`, `stage`, `mediaClass`, `orientation`, `success`,
`durationMs`, and `retryNumber`.

## Current source limitations

- All HLS variants use a portrait ladder. The current FFmpeg filter scales with
  `force_original_aspect_ratio=increase` and then crops to each portrait canvas.
  A landscape source is therefore irreversibly cropped before upload.
- Reel duration validation defaults to 180 seconds. The configuration helper
  clamps `REEL_MAX_DURATION_SECONDS` to at most 600 seconds, so the current
  implementation cannot accept the required 30–60 minute fixture.
- One `processing_queue` carries all Reel and chat-video work. A process-local
  concurrency limiter is the only fairness control.
- Audio is read fully into memory and base64 encoded into a RabbitMQ request.
  Semantic boundary detection and final chunk persistence perform separate,
  sequential embedding requests.
- FFmpeg child CPU utilization is not exposed by the current `fluent-ffmpeg`
  integration. Phase 0 records this field as unavailable instead of inventing
  a value.

## Development fixture matrix

Fixtures are external, configurable absolute paths and must not be committed.
Run the load command once per fixture by setting `REEL_LOAD_TEST_FIXTURE`.

| Fixture          | Required characteristics                                                         | Suggested local path                             |
| ---------------- | -------------------------------------------------------------------------------- | ------------------------------------------------ |
| Short portrait   | 1080x1920, 15–30 seconds                                                         | `/tmp/velora-reel-fixtures/short-portrait.mp4`   |
| Short landscape  | 1920x1080, 15–30 seconds                                                         | `/tmp/velora-reel-fixtures/short-landscape.mp4`  |
| Short square     | 1080x1080, 15–30 seconds                                                         | `/tmp/velora-reel-fixtures/short-square.mp4`     |
| Rotated portrait | 1920x1080 storage dimensions with 90/270 degree rotation metadata, 15–30 seconds | `/tmp/velora-reel-fixtures/rotated-portrait.mp4` |
| Medium landscape | 1920x1080, 5–10 minutes                                                          | `/tmp/velora-reel-fixtures/medium-landscape.mp4` |
| Long landscape   | 1920x1080, 30–60 minutes                                                         | `/tmp/velora-reel-fixtures/long-landscape.mp4`   |
| No-audio clip    | 1280x720, 30–60 seconds, no audio stream                                         | `/tmp/velora-reel-fixtures/no-audio.mp4`         |
| High-FPS clip    | 1920x1080, 60 FPS                                                                | `/tmp/velora-reel-fixtures/high-fps.mp4`         |

## Load-test configuration

```dotenv
REEL_LOAD_TEST_API_URL=http://localhost:3000
REEL_LOAD_TEST_TOKEN=
REEL_LOAD_TEST_TOTAL=10
REEL_LOAD_TEST_CONCURRENCY=5
REEL_LOAD_TEST_FIXTURE=/tmp/velora-reel-fixtures/short-portrait.mp4
REEL_LOAD_TEST_TIMEOUT_MS=900000
```

The runner requests `/media/upload-url`, uploads the fixture to that signed URL,
creates the Reel through `/content/reels`, and polls
`/content/reels/:id/status`. It never writes directly to PostgreSQL.

## Required run log

| Scenario                  | Result                            | Evidence                                                                                                                                                                                                                                                                                                                  |
| ------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 short portrait          | Completed                         | Reel `21ec18cf-dec0-4d38-9b98-6d1116704f36` reached `COMPLETED`; API-observed processing duration was 29,240 ms and total client duration was 31,732 ms.                                                                                                                                                                  |
| 1 short landscape         | Completed; crop reproduced        | Reel `3c1c3516-c0bc-407e-93a7-e96c4673331c` reached `COMPLETED`; API-observed processing duration was 28,448 ms and total client duration was 31,302 ms. Its public HLS master contained 360x640, 540x960, and 720x1280 streams. Crop detection filled the 720x1280 frame and reported `landscapeCroppingObserved: true`. |
| 1 square                  | Failed at existing transcode path | Reel `b1410d9a-3aa3-43fd-bb99-1317ad6f5554` reached `FAILED` at `TRANSCODING`; API-observed processing duration was 4,439 ms. FFmpeg reported `v:1,a:1: Invalid argument`. Phase 0 records this existing limitation without changing encoding behavior.                                                                   |
| 1 rotated clip            | Completed                         | Reel `9e3252c8-df8e-43fe-b4d0-27f12c242b52` reached `COMPLETED`; API-observed processing duration was 24,203 ms. FFprobe reported storage dimensions 1920x1080 with 90-degree rotation, and metrics classified its effective orientation as portrait.                                                                     |
| 1 no-audio clip           | Completed                         | Reel `f7a8aa18-55fc-4a22-a430-ee5dfcbf188b` reached `COMPLETED`; API-observed processing duration was 19,754 ms and source metrics recorded `sourceHasAudio: false`.                                                                                                                                                      |
| 5 concurrent short clips  | 5/5 completed                     | Structured queue wait p50/p95/max was 32,241/70,618/70,618 ms. Total-pipeline p50/p95/max was 14,244/24,872/24,872 ms. The monotonically increasing queue waits expose the current single-lane, process-local serialization.                                                                                              |
| 10 concurrent short clips | 10/10 completed                   | Structured queue wait p50/p95/max was 63,861/159,036/159,036 ms. Total-pipeline p50/p95/max was 14,794/26,602/26,602 ms.                                                                                                                                                                                                  |
| 1 medium landscape clip   | Rejected by current limit         | Reel `bf9d18b2-edaf-4c5b-b85b-17b7e127a5f4` reached `FAILED` with `VIDEO_TOO_LONG`; API-observed processing duration was 2,382 ms and the structured pipeline duration was 490 ms.                                                                                                                                        |
| 1 long landscape clip     | Rejected by current limit         | Reel `e0e0cefa-2920-4e47-95c6-b108327f4e95` reached `FAILED` with `VIDEO_TOO_LONG`; API-observed processing duration was 2,362 ms and the structured pipeline duration was 869 ms. Direct validation returned `1800000ms exceeds maximum 180000ms`; configuration is also capped at 600 seconds.                          |

All runs used the real authenticated Media upload, signed object PUT, Content
Reel creation, and Reel status APIs. Reels were created private. No direct
PostgreSQL insertion was used. The synthetic fixtures remain under
`/tmp/velora-reel-fixtures`; no binary fixture or credential was added to the
repository. The fixture directory also contains the prepared 1920x1080 60 FPS
clip required by the matrix.

## Representative structured metric evidence

The short-landscape run recorded the following stage durations in milliseconds:

| Stage                |      Duration | Additional evidence                                                        |
| -------------------- | ------------: | -------------------------------------------------------------------------- |
| Queue wait           |           281 | Queue `processing_queue`; enqueue timestamp was available.                 |
| Job claim            |           196 | Claim succeeded.                                                           |
| Source download      |         3,204 | 14,955,123 source bytes.                                                   |
| FFprobe              |           309 | 1920x1080, 30 FPS, 15,000 ms, 7,904 Kbps, landscape.                       |
| Source validation    |             0 | Current validation accepted the short fixture.                             |
| Profile selection    |             0 | `balanced`, three portrait variants.                                       |
| FFmpeg transcode     |         5,776 | 28 HLS objects, 8,906,163 HLS bytes, 23,861,286 temporary bytes.           |
| HLS upload           |         3,411 | 28 objects uploaded.                                                       |
| Thumbnail            |         6,114 | 17,787-byte artifact.                                                      |
| Stream validation    |         1,894 | Master, variant, segment, and thumbnail checks passed.                     |
| Audio extraction     |     230 / 334 | Retry numbers 0/1; 480,676-byte WAV artifact.                              |
| Transcription        | 2,605 / 1,215 | Retry numbers 0/1; both no-text responses used the existing fallback path. |
| Metadata extraction  |           639 | Estimated RabbitMQ request payload: 79 bytes.                              |
| Chunking             |             0 | 0 semantic units and 1 final metadata chunk.                               |
| Embedding            |           795 | 1 request, 1 item, 0 failed requests.                                      |
| Total media          |        21,525 | Three encoded variants recorded with actual dimensions.                    |
| Total indexing       |         5,852 | One final embedded chunk.                                                  |
| Completion publish   |             3 | Estimated RabbitMQ event payload: 9,172 bytes.                             |
| Database persistence |           704 | Content status and chunk persistence completed.                            |
| Total pipeline       |        27,388 | Successful completion.                                                     |

FFmpeg CPU utilization is emitted as `null` with
`ffmpegCpuMeasurement: "not_exposed_by_fluent_ffmpeg"`; the current wrapper
does not expose a child-process CPU sample that could be reported accurately.

Do not start Phase 1 until this Phase 0 diff has been reviewed and committed.
