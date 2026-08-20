# Backend Video Call CI Result

- Build exit: 0
- Unit tests exit: 0
- Targeted video E2E exit: 0
- Full E2E exit: 1

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
Time:        1.034 s
Ran all test suites matching apps/call-service/test/unit/application.
```

## Targeted video E2E
```text
PASS apps/call-service/test/e2e/call-flow.e2e.spec.ts
  Call Service P0 flow (e2e)
    ✓ auto-ends unanswered video calls after the backend no-answer timeout (265 ms)
    ✓ switches VOICE to VIDEO and back on the same active call while enforcing media kind (59 ms)
    ✓ rejoin advertises both active audio and video producers for a VIDEO call (42 ms)
    ✓ broadcasts camera off/on without replacing the video producer (40 ms)
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
Time:        1.921 s
Ran all test suites matching apps/call-service/test/e2e/call-flow.e2e.spec.ts with tests matching "auto-ends unanswered video|switches VOICE to VIDEO|rejoin advertises both active audio and video|broadcasts camera off/on".
```

## Full E2E
```text
FAIL apps/call-service/test/e2e/call-flow.e2e.spec.ts (5.322 s)
  Call Service P0 flow (e2e)
    ✓ disconnects clients with missing or invalid tokens and joins valid clients to private rooms (224 ms)
    ✓ runs the happy-path call lifecycle from initiate to answer (53 ms)
    ✓ rejects forged target users before creating a call session (32 ms)
    ✓ runs the media flow from transport creation to consumer resume (41 ms)
    ✓ cancels a call when the caller leaves before answer and clears redis/media state (35 ms)
    ✓ auto-ends unanswered video calls after the backend no-answer timeout (84 ms)
    ✓ switches VOICE to VIDEO and back on the same active call while enforcing media kind (41 ms)
    ✓ rejoin advertises both active audio and video producers for a VIDEO call (44 ms)
    ✓ broadcasts camera off/on without replacing the video producer (35 ms)
    ✓ auto-ends unanswered voice calls after the backend no-answer timeout (81 ms)
    ✓ does not let answer_call bypass join_call before the no-answer timeout (82 ms)
    ✕ fails fast when a ringing call disconnects before answer (88 ms)
    ✓ rejects rejoin attempts for calls that are not active (29 ms)
    ✓ ends an active call after the reconnect grace window expires (80 ms)
    ✓ rejoins an active call within the reconnect grace window (150 ms)
    ✕ rejects rejoin attempts after the reconnect grace window has already expired (3031 ms)
    ✓ rejects rejoin attempts from users outside the active call (30 ms)
    ✓ keeps the call active when one socket disconnects but the same user still has another socket in the call (330 ms)

  ● Call Service P0 flow (e2e) › fails fast when a ringing call disconnects before answer

    expect(received).resolves.toEqual(expected) // deep equality

    - Expected  - 1
    + Received  + 1

      Object {
        "callId": "d4a92938-6d63-4f65-b4ee-c52ecd11dbac",
    -   "reason": "disconnected",
    +   "reason": "no_answer",
      }

    [0m [90m 1280 |[39m     [36mawait[39m callerDisconnected[33m;[39m
     [90m 1281 |[39m
    [31m[1m>[22m[39m[90m 1282 |[39m     [36mawait[39m expect(callEnded)[33m.[39mresolves[33m.[39mtoEqual({
     [90m      |[39m                                      [31m[1m^[22m[39m
     [90m 1283 |[39m       callId[33m,[39m
     [90m 1284 |[39m       reason[33m:[39m [32m'disconnected'[39m[33m,[39m
     [90m 1285 |[39m     })[33m;[39m[0m

      at Object.toEqual (node_modules/.pnpm/expect@30.4.1/node_modules/expect/build/index.js:2140:20)
      at Object.<anonymous> (apps/call-service/test/e2e/call-flow.e2e.spec.ts:1282:38)

  ● Call Service P0 flow (e2e) › rejects rejoin attempts after the reconnect grace window has already expired

    Timed out waiting for call_ended

    [0m [90m 1726 |[39m       [36mconst[39m timer [33m=[39m setTimeout(() [33m=>[39m {
     [90m 1727 |[39m         cleanup()[33m;[39m
    [31m[1m>[22m[39m[90m 1728 |[39m         reject([36mnew[39m [33mError[39m([32m`Timed out waiting for ${event}`[39m))[33m;[39m
     [90m      |[39m                [31m[1m^[22m[39m
     [90m 1729 |[39m       }[33m,[39m [35m3000[39m)[33m;[39m
     [90m 1730 |[39m
     [90m 1731 |[39m       [36mconst[39m cleanup [33m=[39m () [33m=>[39m {[0m

      at Timeout.<anonymous> (apps/call-service/test/e2e/call-flow.e2e.spec.ts:1728:16)

Test Suites: 1 failed, 1 total
Tests:       2 failed, 16 passed, 18 total
Snapshots:   0 total
Time:        5.372 s
Ran all test suites matching apps/call-service/test/e2e/call-flow.e2e.spec.ts.
```
