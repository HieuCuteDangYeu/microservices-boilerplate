const fs = require('node:fs')

const replaceRequired = (source, before, after, label) => {
  if (source.includes(after)) return source
  if (!source.includes(before)) throw new Error(`Missing camera-state anchor: ${label}`)
  return source.replace(before, after)
}

const interfacePath = 'apps/call-service/src/domain/interfaces/call-media.engine.interface.ts'
let contract = fs.readFileSync(interfacePath, 'utf8')
contract = replaceRequired(
  contract,
  `export interface ActiveProducerResult {\n  producerId: string;\n  userId: string;\n  kind: 'audio' | 'video';\n}`,
  `export interface ActiveProducerResult {\n  producerId: string;\n  userId: string;\n  kind: 'audio' | 'video';\n  paused?: boolean;\n}`,
  'ActiveProducerResult.paused',
)
contract = replaceRequired(
  contract,
  `  abstract closeProducer(\n    callId: string,\n    userId: string,\n    producerId: string,\n  ): Promise<void>;`,
  `  abstract pauseProducer(\n    callId: string,\n    userId: string,\n    producerId: string,\n  ): Promise<void>;\n  abstract resumeProducer(\n    callId: string,\n    userId: string,\n    producerId: string,\n  ): Promise<void>;\n  abstract closeProducer(\n    callId: string,\n    userId: string,\n    producerId: string,\n  ): Promise<void>;`,
  'producer pause/resume contract',
)
fs.writeFileSync(interfacePath, contract)

const enginePath = 'apps/call-service/src/infrastructure/engines/mediasoup-call.engine.ts'
let engine = fs.readFileSync(enginePath, 'utf8')
engine = replaceRequired(
  engine,
  `        .map(([producerId, meta]) => ({\n          producerId,\n          userId: meta.userId,\n          kind: meta.kind,\n        })),`,
  `        .map(([producerId, meta]) => ({\n          producerId,\n          userId: meta.userId,\n          kind: meta.kind,\n          paused: room.producers.get(producerId)?.paused ?? false,\n        })),`,
  'listActiveProducers paused state',
)
if (!engine.includes('async pauseProducer(')) {
  const anchor = `  closeProducer(\n    callId: string,\n    userId: string,\n    producerId: string,\n  ): Promise<void> {`
  const addition = `  async pauseProducer(\n    callId: string,\n    userId: string,\n    producerId: string,\n  ): Promise<void> {\n    const room = this.getRoomOrThrow(callId);\n    const producer = room.producers.get(producerId);\n    const meta = room.producerMeta.get(producerId);\n\n    if (!producer || !meta || meta.callId !== callId || meta.userId !== userId) {\n      throw new Error('Producer not found');\n    }\n\n    await producer.pause();\n  }\n\n  async resumeProducer(\n    callId: string,\n    userId: string,\n    producerId: string,\n  ): Promise<void> {\n    const room = this.getRoomOrThrow(callId);\n    const producer = room.producers.get(producerId);\n    const meta = room.producerMeta.get(producerId);\n\n    if (!producer || !meta || meta.callId !== callId || meta.userId !== userId) {\n      throw new Error('Producer not found');\n    }\n\n    await producer.resume();\n  }\n\n`
  if (!engine.includes(anchor)) throw new Error('Missing Mediasoup closeProducer anchor')
  engine = engine.replace(anchor, `${addition}${anchor}`)
}
fs.writeFileSync(enginePath, engine)

const gatewayPath = 'apps/call-service/src/infrastructure/gateways/call.gateway.ts'
let gateway = fs.readFileSync(gatewayPath, 'utf8')
gateway = replaceRequired(
  gateway,
  `type SetCallTypePayload = {\n  callId: string;\n  callType: 'VOICE' | 'VIDEO';\n};`,
  `type SetCallTypePayload = {\n  callId: string;\n  callType: 'VOICE' | 'VIDEO';\n};\n\ntype SetVideoEnabledPayload = {\n  callId: string;\n  producerId: string;\n  enabled: boolean;\n};`,
  'SetVideoEnabledPayload',
)
gateway = gateway.replace(
  /kind: producer\.kind,\n      \}\);/g,
  `kind: producer.kind,\n        paused: producer.paused ?? false,\n      });`,
)
if (!gateway.includes("@SubscribeMessage('set_video_enabled')")) {
  const anchor = `  @SubscribeMessage('set_call_type')\n  async handleSetCallType(`
  const addition = `  @SubscribeMessage('set_video_enabled')\n  async handleSetVideoEnabled(\n    @MessageBody() payload: SetVideoEnabledPayload,\n    @ConnectedSocket() client: Socket,\n  ) {\n    const userId = await this.resolveUserId(client);\n    if (!userId) return;\n\n    const session = await this.sessionRepository.findByCallId(payload.callId);\n    if (!session) {\n      throw new NotFoundException('Call not found');\n    }\n\n    if (session.status !== 'active' || session.callType !== 'VIDEO') {\n      throw new ForbiddenException('Video state cannot be changed');\n    }\n\n    if (session.initiatorId !== userId && session.targetUserId !== userId) {\n      throw new ForbiddenException('You are not part of this call');\n    }\n\n    const producer = (await this.mediaEngine.listActiveProducers(payload.callId)).find(\n      (entry) =>\n        entry.producerId === payload.producerId &&\n        entry.userId === userId &&\n        entry.kind === 'video',\n    );\n    if (!producer) {\n      throw new NotFoundException('Video producer not found');\n    }\n\n    if (payload.enabled) {\n      await this.mediaEngine.resumeProducer(payload.callId, userId, payload.producerId);\n    } else {\n      await this.mediaEngine.pauseProducer(payload.callId, userId, payload.producerId);\n    }\n\n    this.server.to(payload.callId).emit('video_state_changed', {\n      callId: payload.callId,\n      userId,\n      producerId: payload.producerId,\n      enabled: payload.enabled,\n    });\n  }\n\n`
  if (!gateway.includes(anchor)) throw new Error('Missing set_call_type handler anchor')
  gateway = gateway.replace(anchor, `${addition}${anchor}`)
}
fs.writeFileSync(gatewayPath, gateway)

const e2ePath = 'apps/call-service/test/e2e/call-flow.e2e.spec.ts'
let e2e = fs.readFileSync(e2ePath, 'utf8')
e2e = replaceRequired(
  e2e,
  `      kind: 'audio' | 'video';\n      closed: boolean;`,
  `      kind: 'audio' | 'video';\n      paused: boolean;\n      closed: boolean;`,
  'fake producer paused field',
)
e2e = replaceRequired(
  e2e,
  `      kind,\n      closed: false,`,
  `      kind,\n      paused: false,\n      closed: false,`,
  'fake producer initial paused state',
)
e2e = replaceRequired(
  e2e,
  `          kind: producer.kind,\n        }))`,
  `          kind: producer.kind,\n          paused: producer.paused,\n        }))`,
  'fake active producer paused state',
)
if (!e2e.includes('  pauseProducer(\n    callId: string,')) {
  const anchor = `  closeProducer(\n    callId: string,\n    userId: string,\n    producerId: string,\n  ): Promise<void> {`
  const addition = `  pauseProducer(\n    callId: string,\n    userId: string,\n    producerId: string,\n  ): Promise<void> {\n    const room = this.getRoom(callId);\n    const producer = room.producers.get(producerId);\n    if (!producer || producer.userId !== userId || producer.closed) {\n      throw new Error('Producer not found');\n    }\n    producer.paused = true;\n    return Promise.resolve();\n  }\n\n  resumeProducer(\n    callId: string,\n    userId: string,\n    producerId: string,\n  ): Promise<void> {\n    const room = this.getRoom(callId);\n    const producer = room.producers.get(producerId);\n    if (!producer || producer.userId !== userId || producer.closed) {\n      throw new Error('Producer not found');\n    }\n    producer.paused = false;\n    return Promise.resolve();\n  }\n\n`
  if (!e2e.includes(anchor)) throw new Error('Missing fake closeProducer anchor')
  e2e = e2e.replace(anchor, `${addition}${anchor}`)
}
if (!e2e.includes("it('broadcasts camera off/on without replacing the video producer'")) {
  const anchor = `  it('auto-ends unanswered voice calls after the backend no-answer timeout', async () => {`
  const test = `  it('broadcasts camera off/on without replacing the video producer', async () => {\n    const { caller, callee, callId } = await establishActiveCall('VIDEO');\n    const callerSendTransport = await createAndConnectTransport(caller, callId, 'send');\n\n    const videoNoticePromise = onceEvent<{\n      callId: string;\n      userId: string;\n      producerId: string;\n      kind: 'audio' | 'video';\n    }>(callee, 'new_producer');\n    caller.emit('produce', {\n      callId,\n      transportId: callerSendTransport.transportId,\n      kind: 'video',\n      rtpParameters: { codecs: validRtpCapabilities.codecs },\n    });\n    const videoNotice = await videoNoticePromise;\n\n    const cameraOff = onceEvent<{\n      callId: string;\n      userId: string;\n      producerId: string;\n      enabled: boolean;\n    }>(callee, 'video_state_changed');\n    caller.emit('set_video_enabled', {\n      callId,\n      producerId: videoNotice.producerId,\n      enabled: false,\n    });\n    await expect(cameraOff).resolves.toEqual({\n      callId,\n      userId: callerUser.id,\n      producerId: videoNotice.producerId,\n      enabled: false,\n    });\n    expect(\n      mediaEngine.getRoomState(callId)?.producers.get(videoNotice.producerId)?.paused,\n    ).toBe(true);\n\n    const cameraOn = onceEvent<{\n      callId: string;\n      userId: string;\n      producerId: string;\n      enabled: boolean;\n    }>(callee, 'video_state_changed');\n    caller.emit('set_video_enabled', {\n      callId,\n      producerId: videoNotice.producerId,\n      enabled: true,\n    });\n    await expect(cameraOn).resolves.toEqual({\n      callId,\n      userId: callerUser.id,\n      producerId: videoNotice.producerId,\n      enabled: true,\n    });\n    expect(\n      mediaEngine.getRoomState(callId)?.producers.get(videoNotice.producerId)?.paused,\n    ).toBe(false);\n  });\n\n`
  if (!e2e.includes(anchor)) throw new Error('Missing camera-state test insertion anchor')
  e2e = e2e.replace(anchor, `${test}${anchor}`)
}
e2e = e2e.replace(
  `{ userId: calleeUser.id, producerId: audioNotice.producerId, kind: 'audio' },`,
  `{\n          userId: calleeUser.id,\n          producerId: audioNotice.producerId,\n          kind: 'audio',\n          paused: false,\n        },`,
)
e2e = e2e.replace(
  `{ userId: calleeUser.id, producerId: videoNotice.producerId, kind: 'video' },`,
  `{\n          userId: calleeUser.id,\n          producerId: videoNotice.producerId,\n          kind: 'video',\n          paused: false,\n        },`,
)
fs.writeFileSync(e2ePath, e2e)

console.log('Applied guarded video camera-state signaling patch')
