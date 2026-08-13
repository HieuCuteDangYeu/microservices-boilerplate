import {
  CONTENT_OUTBOX_WAKE_EVENT,
  type IOutboxDispatchTrigger,
} from '@content/domain/interfaces/outbox-dispatch-trigger.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';

@Injectable()
export class OutboxDispatchTriggerAdapter implements IOutboxDispatchTrigger {
  private readonly logger = new Logger(OutboxDispatchTriggerAdapter.name);

  constructor(
    @Inject('CONTENT_SELF_RMQ')
    private readonly contentClient: ClientProxy,
  ) {}

  trigger(): void {
    try {
      this.contentClient
        .emit(CONTENT_OUTBOX_WAKE_EVENT, {
          requestedAt: new Date().toISOString(),
        })
        .subscribe({
          error: (error: unknown) => {
            this.logger.warn(this.describeError(error));
          },
        });
    } catch (error: unknown) {
      this.logger.warn(this.describeError(error));
    }
  }

  private describeError(error: unknown): string {
    return error instanceof Error
      ? `Outbox wake publish failed: ${error.message}`
      : 'Outbox wake publish failed';
  }
}
