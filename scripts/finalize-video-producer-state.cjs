const fs = require('node:fs')

const repositoryPath =
  'apps/call-service/src/infrastructure/repositories/redis-call-state.repository.ts'
let repository = fs.readFileSync(repositoryPath, 'utf8')

if (!repository.includes('async removeProducerState(')) {
  const anchor = `  async saveProducerState(state: StoredProducerState): Promise<void> {\n    const key = this.producerKey(state.callId, state.userId, state.producerId);\n    await this.redis.set(key, JSON.stringify(state), 'EX', 60 * 60 * 6);\n    await this.redis.sadd(this.producerIndexKey(state.callId), key);\n    await this.redis.expire(this.producerIndexKey(state.callId), 60 * 60 * 6);\n  }\n`
  if (!repository.includes(anchor)) {
    throw new Error('Producer persistence anchor not found')
  }
  repository = repository.replace(
    anchor,
    `${anchor}\n  async removeProducerState(\n    callId: string,\n    userId: string,\n    producerId: string,\n  ): Promise<void> {\n    const key = this.producerKey(callId, userId, producerId);\n    await this.redis.del(key);\n    await this.redis.srem(this.producerIndexKey(callId), key);\n  }\n`,
  )
}
fs.writeFileSync(repositoryPath, repository)

const enginePath = 'apps/call-service/src/infrastructure/engines/mediasoup-call.engine.ts'
let engine = fs.readFileSync(enginePath, 'utf8')

const oldTransportClose = `    producer.on('transportclose', () => {\n      room.producers.delete(producer.id);\n      room.producerMeta.delete(producer.id);\n    });`
const newTransportClose = `    producer.on('transportclose', () => {\n      room.producers.delete(producer.id);\n      room.producerMeta.delete(producer.id);\n      void this.stateRepository\n        .removeProducerState(callId, userId, producer.id)\n        .catch((error: unknown) => {\n          this.logger.warn(\n            \`Failed to remove producer state after transport close producer=\${producer.id}: \${\n              error instanceof Error ? error.message : String(error)\n            }\`,\n          );\n        });\n    });`
if (!engine.includes(newTransportClose)) {
  if (!engine.includes(oldTransportClose)) {
    throw new Error('Producer transport-close cleanup anchor not found')
  }
  engine = engine.replace(oldTransportClose, newTransportClose)
}

const oldCloseProducer = `  closeProducer(\n    callId: string,\n    userId: string,\n    producerId: string,\n  ): Promise<void> {\n    const room = this.getRoomOrThrow(callId);\n    const producer = room.producers.get(producerId);\n    const meta = room.producerMeta.get(producerId);\n\n    if (\n      !producer ||\n      !meta ||\n      meta.callId !== callId ||\n      meta.userId !== userId\n    ) {\n      throw new Error('Producer not found');\n    }\n\n    producer.close();\n    room.producers.delete(producerId);\n    room.producerMeta.delete(producerId);\n    return Promise.resolve();\n  }`
const newCloseProducer = `  async closeProducer(\n    callId: string,\n    userId: string,\n    producerId: string,\n  ): Promise<void> {\n    const room = this.getRoomOrThrow(callId);\n    const producer = room.producers.get(producerId);\n    const meta = room.producerMeta.get(producerId);\n\n    if (\n      !producer ||\n      !meta ||\n      meta.callId !== callId ||\n      meta.userId !== userId\n    ) {\n      throw new Error('Producer not found');\n    }\n\n    producer.close();\n    room.producers.delete(producerId);\n    room.producerMeta.delete(producerId);\n    await this.stateRepository.removeProducerState(callId, userId, producerId);\n  }`
if (!engine.includes(newCloseProducer)) {
  if (!engine.includes(oldCloseProducer)) {
    throw new Error('closeProducer cleanup anchor not found')
  }
  engine = engine.replace(oldCloseProducer, newCloseProducer)
}

fs.writeFileSync(enginePath, engine)
console.log('Finalized closed producer Redis cleanup')
