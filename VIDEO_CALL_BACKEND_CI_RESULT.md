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
FAIL apps/call-service/test/e2e/call-flow.e2e.spec.ts (5.515 s)
  ● Call Service P0 flow (e2e) › rejoin advertises both active audio and video producers for a VIDEO call

    expect(received).toEqual(expected) // deep equality

    Expected: ArrayContaining [{"kind": "audio", "producerId": "producer-1", "userId": "callee-user"}, {"kind": "video", "producerId": "producer-2", "userId": "callee-user"}]
    Received: [{"kind": "audio", "paused": false, "producerId": "producer-1", "userId": "callee-user"}, {"kind": "video", "paused": false, "producerId": "producer-2", "userId": "callee-user"}]

    [0m [90m 1083 |[39m       expect[33m.[39mobjectContaining({ status[33m:[39m [32m'active'[39m[33m,[39m callType[33m:[39m [32m'VIDEO'[39m })[33m,[39m
     [90m 1084 |[39m     )[33m;[39m
    [31m[1m>[22m[39m[90m 1085 |[39m     expect(payload[33m.[39mactiveProducers)[33m.[39mtoEqual(
     [90m      |[39m                                     [31m[1m^[22m[39m
     [90m 1086 |[39m       expect[33m.[39marrayContaining([
     [90m 1087 |[39m         {
     [90m 1088 |[39m           userId[33m:[39m calleeUser[33m.[39mid[33m,[39m[0m

      at Object.<anonymous> (apps/call-service/test/e2e/call-flow.e2e.spec.ts:1085:37)

  ● Call Service P0 flow (e2e) › fails fast when a ringing call disconnects before answer

    expect(received).resolves.toEqual(expected) // deep equality

    - Expected  - 1
    + Received  + 1

      Object {
        "callId": "f46b4141-db1f-4a3b-9be1-a7958dbd804d",
    -   "reason": "disconnected",
    +   "reason": "no_answer",
      }

    [0m [90m 1278 |[39m     [36mawait[39m callerDisconnected[33m;[39m
     [90m 1279 |[39m
    [31m[1m>[22m[39m[90m 1280 |[39m     [36mawait[39m expect(callEnded)[33m.[39mresolves[33m.[39mtoEqual({
     [90m      |[39m                                      [31m[1m^[22m[39m
     [90m 1281 |[39m       callId[33m,[39m
     [90m 1282 |[39m       reason[33m:[39m [32m'disconnected'[39m[33m,[39m
     [90m 1283 |[39m     })[33m;[39m[0m

      at Object.toEqual (node_modules/.pnpm/expect@30.4.1/node_modules/expect/build/index.js:2140:20)
      at Object.<anonymous> (apps/call-service/test/e2e/call-flow.e2e.spec.ts:1280:38)

  ● Call Service P0 flow (e2e) › ends an active call after the reconnect grace window expires

    expect(received).resolves.toEqual()

    Received promise rejected instead of resolved
    Rejected to value: [Error: Timed out waiting for call_ended]

    [0m [90m 1324 |[39m     expect(disconnectedParticipant[33m?[39m[33m.[39mreconnectDeadlineAt)[33m.[39mtoBeDefined()[33m;[39m
     [90m 1325 |[39m
    [31m[1m>[22m[39m[90m 1326 |[39m     [36mawait[39m expect(callEnded)[33m.[39mresolves[33m.[39mtoEqual({
     [90m      |[39m           [31m[1m^[22m[39m
     [90m 1327 |[39m       callId[33m,[39m
     [90m 1328 |[39m       reason[33m:[39m [32m'disconnected'[39m[33m,[39m
     [90m 1329 |[39m     })[33m;[39m[0m

      at expect (node_modules/.pnpm/expect@30.4.1/node_modules/expect/build/index.js:2116:15)
      at Object.<anonymous> (apps/call-service/test/e2e/call-flow.e2e.spec.ts:1326:11)

  ● Call Service P0 flow (e2e) › rejoins an active call within the reconnect grace window

    expect(received).resolves.toEqual(expected) // deep equality

    - Expected  - 0
    + Received  + 1

      Object {
        "callId": "b0511dfe-0f54-4b36-a0d5-a7b709f300ed",
        "kind": "audio",
    +   "paused": false,
        "producerId": "producer-1",
        "userId": "callee-user",
      }

    [0m [90m 1411 |[39m       })[33m,[39m
     [90m 1412 |[39m     )[33m;[39m
    [31m[1m>[22m[39m[90m 1413 |[39m     [36mawait[39m expect(replayedProducer)[33m.[39mresolves[33m.[39mtoEqual({
     [90m      |[39m                                             [31m[1m^[22m[39m
     [90m 1414 |[39m       callId[33m,[39m
     [90m 1415 |[39m       userId[33m:[39m calleeUser[33m.[39mid[33m,[39m
     [90m 1416 |[39m       producerId[33m:[39m producedByCallee[33m.[39mproducerId[33m,[39m[0m

      at Object.toEqual (node_modules/.pnpm/expect@30.4.1/node_modules/expect/build/index.js:2140:20)
      at Object.<anonymous> (apps/call-service/test/e2e/call-flow.e2e.spec.ts:1413:45)

PASS apps/call-service/test/unit/application/call-lifecycle.use-case.spec.ts
PASS apps/call-service/test/unit/application/video-call.use-case.spec.ts

Test Suites: 1 failed, 2 passed, 3 total
Tests:       4 failed, 28 passed, 32 total
Snapshots:   0 total
Time:        5.863 s
Ran all test suites matching apps/call-service/test/unit/application|apps/call-service/test/e2e/call-flow.e2e.spec.ts.
Jest did not exit one second after the test run has completed.

'This usually means that there are asynchronous operations that weren't stopped in your tests. Consider running Jest with `--detectOpenHandles` to troubleshoot this issue.
/home/runner/work/microservices-boilerplate/microservices-boilerplate/apps/call-service/test/e2e/call-flow.e2e.spec.ts:1096
                reject(new Error(`Timed out waiting for ${event}`));
                       ^

[Error: Timed out waiting for peer_reconnected]

Node.js v20.20.2
```
