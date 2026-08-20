const fs = require('node:fs')

const gatewayPath = 'apps/call-service/src/infrastructure/gateways/call.gateway.ts'
let source = fs.readFileSync(gatewayPath, 'utf8')

const oldDisconnectBlock = `        if (\n          session.status === 'initiated' ||\n          session.status === 'ringing' ||\n          session.status === 'active'\n        ) {\n          const reconnectDeadlineAt = new Date(\n            Date.now() + this.reconnectGraceMs,\n          );\n          await this.stateRepository.upsertParticipant(\n            new CallParticipant({\n              ...participant,\n              socketIds: [],\n              socketId: undefined,\n              isConnected: false,\n              reconnectDeadlineAt,\n            }),\n          );\n          if (session.status === 'active') {\n            this.server.to(callId).emit('peer_reconnecting', {\n              callId,\n              userId,\n              reconnectDeadlineAt: reconnectDeadlineAt.toISOString(),\n            });\n          }\n          this.scheduleDisconnectFinalization(callId, userId);\n          continue;\n        }`

const newDisconnectBlock = `        if (session.status === 'active') {\n          const reconnectDeadlineAt = new Date(\n            Date.now() + this.reconnectGraceMs,\n          );\n          await this.stateRepository.upsertParticipant(\n            new CallParticipant({\n              ...participant,\n              socketIds: [],\n              socketId: undefined,\n              isConnected: false,\n              reconnectDeadlineAt,\n            }),\n          );\n          this.server.to(callId).emit('peer_reconnecting', {\n            callId,\n            userId,\n            reconnectDeadlineAt: reconnectDeadlineAt.toISOString(),\n          });\n          this.scheduleDisconnectFinalization(callId, userId);\n          continue;\n        }\n\n        if (session.status === 'initiated' || session.status === 'ringing') {\n          await this.stateRepository.removeParticipant(callId, userId);\n          const result = await this.leaveCallUseCase.execute(\n            callId,\n            userId,\n            'disconnected',\n          );\n          if (result.shouldEmitPeerLeft) {\n            this.emitPeerLeft(callId, userId, 'disconnected');\n          }\n          this.emitCallEnded(result.session, result.endedReason);\n          continue;\n        }`

if (!source.includes(newDisconnectBlock)) {
  if (!source.includes(oldDisconnectBlock)) {
    throw new Error('Disconnect lifecycle patch anchor not found')
  }
  source = source.replace(oldDisconnectBlock, newDisconnectBlock)
}

if (!source.includes('delayMs = this.reconnectGraceMs')) {
  const start = source.indexOf('  private scheduleDisconnectFinalization(')
  const end = source.indexOf('  private scheduleUnansweredCallTimeout(', start)
  if (start < 0 || end < 0) {
    throw new Error('Disconnect finalization method bounds not found')
  }

  const replacement = `  private scheduleDisconnectFinalization(\n    callId: string,\n    userId: string,\n    delayMs = this.reconnectGraceMs,\n  ): void {\n    this.clearPendingDisconnect(callId, userId);\n\n    let rescheduled = false;\n    const timeoutId = setTimeout(() => {\n      void (async () => {\n        try {\n          const participant = await this.stateRepository.getParticipant(\n            callId,\n            userId,\n          );\n\n          if (\n            !participant ||\n            participant.isConnected ||\n            !participant.reconnectDeadlineAt\n          ) {\n            return;\n          }\n\n          const remainingMs =\n            participant.reconnectDeadlineAt.getTime() - Date.now();\n          if (remainingMs > 0) {\n            rescheduled = true;\n            this.scheduleDisconnectFinalization(callId, userId, remainingMs);\n            return;\n          }\n\n          await this.stateRepository.removeParticipant(callId, userId);\n          const result = await this.leaveCallUseCase.execute(\n            callId,\n            userId,\n            'disconnected',\n          );\n          if (result.shouldEmitPeerLeft) {\n            this.emitPeerLeft(callId, userId, 'disconnected');\n          }\n          this.emitCallEnded(result.session, result.endedReason);\n        } catch (error) {\n          this.logger.warn(\n            \`Deferred disconnect cleanup failed for call \${callId}: \${\n              error instanceof Error ? error.message : String(error)\n            }\`,\n          );\n        } finally {\n          if (!rescheduled) {\n            this.clearPendingDisconnect(callId, userId);\n          }\n        }\n      })();\n    }, Math.max(1, delayMs));\n\n    this.pendingDisconnects.set(this.disconnectKey(callId, userId), timeoutId);\n  }\n\n`

  source = `${source.slice(0, start)}${replacement}${source.slice(end)}`
}

fs.writeFileSync(gatewayPath, source)
console.log('Finalized call disconnect lifecycle and reconnect deadline timing')
