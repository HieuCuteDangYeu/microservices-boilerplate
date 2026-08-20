# Backend Video Call CI Result

- Build exit: 0
- Unit tests exit: 0
- Targeted video E2E exit: 0
- Full E2E exit: 0

## Build
```text

> microservices-boilerplate@0.0.1 build:call /home/runner/work/microservices-boilerplate/microservices-boilerplate
> nest build call-service

```

## Unit tests
```text
PASS apps/call-service/test/unit/application/call-lifecycle.use-case.spec.ts
PASS apps/call-service/test/unit/application/video-call.use-case.spec.ts

Test Suites: 2 passed, 2 total
Tests:       14 passed, 14 total
Snapshots:   0 total
Time:        1.028 s
Ran all test suites matching apps/call-service/test/unit/application.
```

## Targeted video E2E
```text
PASS apps/call-service/test/e2e/call-flow.e2e.spec.ts
  Call Service P0 flow (e2e)
    ✓ auto-ends unanswered video calls after the backend no-answer timeout (252 ms)
    ✓ switches VOICE to VIDEO and back on the same active call while enforcing media kind (60 ms)
    ✓ rejoin advertises both active audio and video producers for a VIDEO call (40 ms)
    ✓ broadcasts camera off/on without replacing the video producer (37 ms)
    ○ skipped disconnects clients with missing or invalid tokens and joins valid clients to private rooms
    ○ skipped runs the happy-path call lifecycle from initiate to answer
    ○ skipped rejects forged target users before creating a call session
    ○ skipped runs the media flow from transport creation to consumer resume
    ○ skipped cancels a call when the caller leaves before answer and clears redis/media state
    ○ skipped auto-ends unanswered voice calls after the backend no-answer timeout
    ○ skipped does not let answer_call bypass join_call before the no-answer timeout
    ○ skipped fails fast when a ringing call disconnects before answer
    ○ skipped rejects rejoin attempts for calls that are not active
    ○ skipped ends an active call after the reconnect grace window expires
    ○ skipped rejoins an active call within the reconnect grace window
    ○ skipped rejects rejoin attempts after the reconnect grace window has already expired
    ○ skipped rejects rejoin attempts from users outside the active call
    ○ skipped keeps the call active when one socket disconnects but the same user still has another socket in the call

Test Suites: 1 passed, 1 total
Tests:       14 skipped, 4 passed, 18 total
Snapshots:   0 total
Time:        1.83 s
Ran all test suites matching apps/call-service/test/e2e/call-flow.e2e.spec.ts with tests matching "auto-ends unanswered video|switches VOICE to VIDEO|rejoin advertises both active audio and video|broadcasts camera off/on".
```

## Full E2E
```text
PASS apps/call-service/test/e2e/call-flow.e2e.spec.ts
  Call Service P0 flow (e2e)
    ✓ disconnects clients with missing or invalid tokens and joins valid clients to private rooms (215 ms)
    ✓ runs the happy-path call lifecycle from initiate to answer (54 ms)
    ✓ rejects forged target users before creating a call session (28 ms)
    ✓ runs the media flow from transport creation to consumer resume (37 ms)
    ✓ cancels a call when the caller leaves before answer and clears redis/media state (31 ms)
    ✓ auto-ends unanswered video calls after the backend no-answer timeout (81 ms)
    ✓ switches VOICE to VIDEO and back on the same active call while enforcing media kind (41 ms)
    ✓ rejoin advertises both active audio and video producers for a VIDEO call (44 ms)
    ✓ broadcasts camera off/on without replacing the video producer (33 ms)
    ✓ auto-ends unanswered voice calls after the backend no-answer timeout (80 ms)
    ✓ does not let answer_call bypass join_call before the no-answer timeout (78 ms)
    ✓ fails fast when a ringing call disconnects before answer (32 ms)
    ✓ rejects rejoin attempts for calls that are not active (27 ms)
    ✓ ends an active call after the reconnect grace window expires (77 ms)
    ✓ rejoins an active call within the reconnect grace window (148 ms)
    ✓ rejects rejoin attempts after the reconnect grace window has already expired (79 ms)
    ✓ rejects rejoin attempts from users outside the active call (29 ms)
    ✓ keeps the call active when one socket disconnects but the same user still has another socket in the call (332 ms)

Test Suites: 1 passed, 1 total
Tests:       18 passed, 18 total
Snapshots:   0 total
Time:        2.339 s
Ran all test suites matching apps/call-service/test/e2e/call-flow.e2e.spec.ts.
```
