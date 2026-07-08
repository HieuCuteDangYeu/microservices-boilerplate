import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import type { CallLifecyclePayload } from '../../domain/interfaces/call-event.publisher.interface';
import { CallLifecycleEvent } from '../../domain/interfaces/call-event.publisher.interface';
import { NotificationServiceAdapter } from '../adapters/notification-service.adapter';

@Controller()
export class CallEventsSubscriber {
  private readonly logger = new Logger(CallEventsSubscriber.name);

  constructor(private readonly notificationService: NotificationServiceAdapter) {}

  @EventPattern('call.initiated')
  async handleCallInitiated(@Payload() payload: CallLifecyclePayload) {
    return this.handle('call.initiated', payload);
  }

  @EventPattern('call.answered')
  async handleCallAnswered(@Payload() payload: CallLifecyclePayload) {
    return this.handle('call.answered', payload);
  }

  @EventPattern('call.ended')
  async handleCallEnded(@Payload() payload: CallLifecyclePayload) {
    return this.handle('call.ended', payload);
  }

  @EventPattern('call.rejected')
  async handleCallRejected(@Payload() payload: CallLifecyclePayload) {
    return this.handle('call.rejected', payload);
  }

  private async handle(
    event: CallLifecycleEvent,
    payload: CallLifecyclePayload,
  ) {
    this.logger.log(`${event} call=${payload.callId} user=${payload.userId}`);
    await this.notificationService.notifyCallLifecycle(event, payload);
    return { event, payload };
  }
}
