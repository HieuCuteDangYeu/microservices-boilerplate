import { DispatchOutboxEventsUseCase } from '@content/application/use-cases/dispatch-outbox-events.use-case';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';

@Injectable()
export class OutboxDispatcherService implements OnApplicationBootstrap {
  private readonly logger = new Logger(OutboxDispatcherService.name);
  private dispatching = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly dispatchOutboxEventsUseCase: DispatchOutboxEventsUseCase,
  ) {}

  onApplicationBootstrap(): void {
    void this.dispatch();
  }

  @Interval(1000)
  async dispatch(): Promise<void> {
    if (this.dispatching) {
      return;
    }

    this.dispatching = true;

    try {
      const result = await this.dispatchOutboxEventsUseCase.execute({
        batchSize: this.getPositiveInteger('OUTBOX_DISPATCH_BATCH_SIZE', 25),
        staleClaimMs: this.getPositiveInteger('OUTBOX_CLAIM_STALE_MS', 60_000),
      });

      if (result.claimed > 0) {
        this.logger.log(
          `Outbox dispatch claimed=${result.claimed} published=${result.published} failed=${result.failed}`,
        );
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Outbox dispatch cycle failed: ${message}`);
    } finally {
      this.dispatching = false;
    }
  }

  private getPositiveInteger(key: string, fallback: number): number {
    const value = Number(this.configService.get<string>(key) ?? fallback);

    return Number.isInteger(value) && value > 0 ? value : fallback;
  }
}
