import { Controller, Logger } from '@nestjs/common'
import { EventPattern, Payload } from '@nestjs/microservices'
import { CallLifecycleEvent, CallLifecyclePayload } from '../../domain/interfaces/call-event.publisher.interface'

@Controller()
export class CallEventsSubscriber {
  private readonly logger = new Logger(CallEventsSubscriber.name)

  @EventPattern('call.initiated')
  handleCallInitiated(@Payload() payload: CallLifecyclePayload) {
    return this.handle('call.initiated', payload)
  }

  @EventPattern('call.answered')
  handleCallAnswered(@Payload() payload: CallLifecyclePayload) {
    return this.handle('call.answered', payload)
  }

  @EventPattern('call.ended')
  handleCallEnded(@Payload() payload: CallLifecyclePayload) {
    return this.handle('call.ended', payload)
  }

  @EventPattern('call.rejected')
  handleCallRejected(@Payload() payload: CallLifecyclePayload) {
    return this.handle('call.rejected', payload)
  }

  private handle(event: CallLifecycleEvent, payload: CallLifecyclePayload) {
    this.logger.log(`${event} room=${payload.roomId} user=${payload.userId}`)
    return { event, payload }
  }
}
