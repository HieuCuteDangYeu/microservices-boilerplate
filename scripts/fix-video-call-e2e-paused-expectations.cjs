const fs = require('node:fs')

const filePath = 'apps/call-service/test/e2e/call-flow.e2e.spec.ts'
let source = fs.readFileSync(filePath, 'utf8')

source = source.replace(
  `        {\n          userId: calleeUser.id,\n          producerId: audioNotice.producerId,\n          kind: 'audio',\n        },\n        {\n          userId: calleeUser.id,\n          producerId: videoNotice.producerId,\n          kind: 'video',\n        },`,
  `        {\n          userId: calleeUser.id,\n          producerId: audioNotice.producerId,\n          kind: 'audio',\n          paused: false,\n        },\n        {\n          userId: calleeUser.id,\n          producerId: videoNotice.producerId,\n          kind: 'video',\n          paused: false,\n        },`,
)
source = source.replace(
  `    await expect(replayedProducer).resolves.toEqual({\n      callId,\n      userId: calleeUser.id,\n      producerId: producedByCallee.producerId,\n      kind: 'audio',\n    });`,
  `    await expect(replayedProducer).resolves.toEqual({\n      callId,\n      userId: calleeUser.id,\n      producerId: producedByCallee.producerId,\n      kind: 'audio',\n      paused: false,\n    });`,
)

if (!source.includes("producerId: audioNotice.producerId,\n          kind: 'audio',\n          paused: false,")) {
  throw new Error('VIDEO rejoin paused expectation was not normalized')
}
if (!source.includes("producerId: producedByCallee.producerId,\n      kind: 'audio',\n      paused: false,")) {
  throw new Error('Legacy rejoin replay paused expectation was not normalized')
}

fs.writeFileSync(filePath, source)
console.log('Normalized E2E producer paused expectations')
