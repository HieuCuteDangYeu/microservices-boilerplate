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
  ● Call Service P0 flow (e2e) › fails fast when a ringing call disconnects before answer

    expect(received).resolves.toEqual(expected) // deep equality

    - Expected  - 1
    + Received  + 1

      Object {
        "callId": "41195d40-a0d9-4a80-bf65-4bfb69756aa1",
    -   "reason": "disconnected",
    +   "reason": "no_answer",
      }

    [0m [90m 1180 |[39m     [36mawait[39m callerDisconnected[33m;[39m
     [90m 1181 |[39m
    [31m[1m>[22m[39m[90m 1182 |[39m     [36mawait[39m expect(callEnded)[33m.[39mresolves[33m.[39mtoEqual({
     [90m      |[39m                                      [31m[1m^[22m[39m
     [90m 1183 |[39m       callId[33m,[39m
     [90m 1184 |[39m       reason[33m:[39m [32m'disconnected'[39m[33m,[39m
     [90m 1185 |[39m     })[33m;[39m[0m

      at Object.toEqual (node_modules/.pnpm/expect@30.4.1/node_modules/expect/build/index.js:2140:20)
      at Object.<anonymous> (apps/call-service/test/e2e/call-flow.e2e.spec.ts:1182:38)

PASS apps/call-service/test/unit/application/call-lifecycle.use-case.spec.ts
PASS apps/call-service/test/unit/application/video-call.use-case.spec.ts

Test Suites: 1 failed, 2 passed, 3 total
Tests:       1 failed, 30 passed, 31 total
Snapshots:   0 total
Time:        2.936 s
Ran all test suites matching apps/call-service/test/unit/application|apps/call-service/test/e2e/call-flow.e2e.spec.ts.
```
