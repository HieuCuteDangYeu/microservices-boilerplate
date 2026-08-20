# Backend Video Call CI Result

- Build exit: 0
- Tests exit: 1

## Build
```text

> microservices-boilerplate@0.0.1 build:call /home/runner/work/microservices-boilerplate/microservices-boilerplate
> nest build call-service

```

## Tests
```text
FAIL apps/call-service/test/e2e/call-flow.e2e.spec.ts
  ● Call Service P0 flow (e2e) › disconnects clients with missing or invalid tokens and joins valid clients to private rooms

    spawn /home/runner/work/microservices-boilerplate/microservices-boilerplate/node_modules/.pnpm/mediasoup@3.20.9/node_modules/mediasoup/worker/out/Release/mediasoup-worker ENOENT

      at ChildProcess.<anonymous> (node_modules/.pnpm/mediasoup@3.20.9/node_modules/mediasoup/node/lib/Worker.js:193:39)

  ● Call Service P0 flow (e2e) › runs the happy-path call lifecycle from initiate to answer

    spawn /home/runner/work/microservices-boilerplate/microservices-boilerplate/node_modules/.pnpm/mediasoup@3.20.9/node_modules/mediasoup/worker/out/Release/mediasoup-worker ENOENT

      at ChildProcess.<anonymous> (node_modules/.pnpm/mediasoup@3.20.9/node_modules/mediasoup/node/lib/Worker.js:193:39)

  ● Call Service P0 flow (e2e) › rejects forged target users before creating a call session

    spawn /home/runner/work/microservices-boilerplate/microservices-boilerplate/node_modules/.pnpm/mediasoup@3.20.9/node_modules/mediasoup/worker/out/Release/mediasoup-worker ENOENT

      at ChildProcess.<anonymous> (node_modules/.pnpm/mediasoup@3.20.9/node_modules/mediasoup/node/lib/Worker.js:193:39)

  ● Call Service P0 flow (e2e) › runs the media flow from transport creation to consumer resume

    spawn /home/runner/work/microservices-boilerplate/microservices-boilerplate/node_modules/.pnpm/mediasoup@3.20.9/node_modules/mediasoup/worker/out/Release/mediasoup-worker ENOENT

      at ChildProcess.<anonymous> (node_modules/.pnpm/mediasoup@3.20.9/node_modules/mediasoup/node/lib/Worker.js:193:39)

  ● Call Service P0 flow (e2e) › cancels a call when the caller leaves before answer and clears redis/media state

    spawn /home/runner/work/microservices-boilerplate/microservices-boilerplate/node_modules/.pnpm/mediasoup@3.20.9/node_modules/mediasoup/worker/out/Release/mediasoup-worker ENOENT

      at ChildProcess.<anonymous> (node_modules/.pnpm/mediasoup@3.20.9/node_modules/mediasoup/node/lib/Worker.js:193:39)

  ● Call Service P0 flow (e2e) › auto-ends unanswered video calls after the backend no-answer timeout

    spawn /home/runner/work/microservices-boilerplate/microservices-boilerplate/node_modules/.pnpm/mediasoup@3.20.9/node_modules/mediasoup/worker/out/Release/mediasoup-worker ENOENT

      at ChildProcess.<anonymous> (node_modules/.pnpm/mediasoup@3.20.9/node_modules/mediasoup/node/lib/Worker.js:193:39)

  ● Call Service P0 flow (e2e) › switches VOICE to VIDEO and back on the same active call while enforcing media kind

    spawn /home/runner/work/microservices-boilerplate/microservices-boilerplate/node_modules/.pnpm/mediasoup@3.20.9/node_modules/mediasoup/worker/out/Release/mediasoup-worker ENOENT

      at ChildProcess.<anonymous> (node_modules/.pnpm/mediasoup@3.20.9/node_modules/mediasoup/node/lib/Worker.js:193:39)

  ● Call Service P0 flow (e2e) › rejoin advertises both active audio and video producers for a VIDEO call

    spawn /home/runner/work/microservices-boilerplate/microservices-boilerplate/node_modules/.pnpm/mediasoup@3.20.9/node_modules/mediasoup/worker/out/Release/mediasoup-worker ENOENT

      at ChildProcess.<anonymous> (node_modules/.pnpm/mediasoup@3.20.9/node_modules/mediasoup/node/lib/Worker.js:193:39)

  ● Call Service P0 flow (e2e) › auto-ends unanswered voice calls after the backend no-answer timeout

    spawn /home/runner/work/microservices-boilerplate/microservices-boilerplate/node_modules/.pnpm/mediasoup@3.20.9/node_modules/mediasoup/worker/out/Release/mediasoup-worker ENOENT

      at ChildProcess.<anonymous> (node_modules/.pnpm/mediasoup@3.20.9/node_modules/mediasoup/node/lib/Worker.js:193:39)

  ● Call Service P0 flow (e2e) › does not let answer_call bypass join_call before the no-answer timeout

    spawn /home/runner/work/microservices-boilerplate/microservices-boilerplate/node_modules/.pnpm/mediasoup@3.20.9/node_modules/mediasoup/worker/out/Release/mediasoup-worker ENOENT

      at ChildProcess.<anonymous> (node_modules/.pnpm/mediasoup@3.20.9/node_modules/mediasoup/node/lib/Worker.js:193:39)

  ● Call Service P0 flow (e2e) › fails fast when a ringing call disconnects before answer

    spawn /home/runner/work/microservices-boilerplate/microservices-boilerplate/node_modules/.pnpm/mediasoup@3.20.9/node_modules/mediasoup/worker/out/Release/mediasoup-worker ENOENT

      at ChildProcess.<anonymous> (node_modules/.pnpm/mediasoup@3.20.9/node_modules/mediasoup/node/lib/Worker.js:193:39)

  ● Call Service P0 flow (e2e) › rejects rejoin attempts for calls that are not active

    spawn /home/runner/work/microservices-boilerplate/microservices-boilerplate/node_modules/.pnpm/mediasoup@3.20.9/node_modules/mediasoup/worker/out/Release/mediasoup-worker ENOENT

      at ChildProcess.<anonymous> (node_modules/.pnpm/mediasoup@3.20.9/node_modules/mediasoup/node/lib/Worker.js:193:39)

  ● Call Service P0 flow (e2e) › ends an active call after the reconnect grace window expires

    spawn /home/runner/work/microservices-boilerplate/microservices-boilerplate/node_modules/.pnpm/mediasoup@3.20.9/node_modules/mediasoup/worker/out/Release/mediasoup-worker ENOENT

      at ChildProcess.<anonymous> (node_modules/.pnpm/mediasoup@3.20.9/node_modules/mediasoup/node/lib/Worker.js:193:39)

  ● Call Service P0 flow (e2e) › rejoins an active call within the reconnect grace window

    spawn /home/runner/work/microservices-boilerplate/microservices-boilerplate/node_modules/.pnpm/mediasoup@3.20.9/node_modules/mediasoup/worker/out/Release/mediasoup-worker ENOENT

      at ChildProcess.<anonymous> (node_modules/.pnpm/mediasoup@3.20.9/node_modules/mediasoup/node/lib/Worker.js:193:39)

  ● Call Service P0 flow (e2e) › rejects rejoin attempts after the reconnect grace window has already expired

    spawn /home/runner/work/microservices-boilerplate/microservices-boilerplate/node_modules/.pnpm/mediasoup@3.20.9/node_modules/mediasoup/worker/out/Release/mediasoup-worker ENOENT

      at ChildProcess.<anonymous> (node_modules/.pnpm/mediasoup@3.20.9/node_modules/mediasoup/node/lib/Worker.js:193:39)

  ● Call Service P0 flow (e2e) › rejects rejoin attempts from users outside the active call

    spawn /home/runner/work/microservices-boilerplate/microservices-boilerplate/node_modules/.pnpm/mediasoup@3.20.9/node_modules/mediasoup/worker/out/Release/mediasoup-worker ENOENT

      at ChildProcess.<anonymous> (node_modules/.pnpm/mediasoup@3.20.9/node_modules/mediasoup/node/lib/Worker.js:193:39)

  ● Call Service P0 flow (e2e) › keeps the call active when one socket disconnects but the same user still has another socket in the call

    spawn /home/runner/work/microservices-boilerplate/microservices-boilerplate/node_modules/.pnpm/mediasoup@3.20.9/node_modules/mediasoup/worker/out/Release/mediasoup-worker ENOENT

      at ChildProcess.<anonymous> (node_modules/.pnpm/mediasoup@3.20.9/node_modules/mediasoup/node/lib/Worker.js:193:39)

PASS apps/call-service/test/unit/application/call-lifecycle.use-case.spec.ts
PASS apps/call-service/test/unit/application/video-call.use-case.spec.ts

Test Suites: 1 failed, 2 passed, 3 total
Tests:       17 failed, 14 passed, 31 total
Snapshots:   0 total
Time:        2.383 s
Ran all test suites matching apps/call-service/test/unit/application|apps/call-service/test/e2e/call-flow.e2e.spec.ts.
```
