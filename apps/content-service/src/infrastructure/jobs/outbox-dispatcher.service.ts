import { DispatchOutboxEventsUseCase } from '@content/application/use-cases/dispatch-outbox-events.use-case';
import type { IOutboxDispatchTrigger } from '@content/domain/interfaces/outbox-dispatch-trigger.interface';
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const DEFAULT_SAFETY_SWEEP_MS = 30 * 60_000;
const MIN_SAFETY_SWEEP_MS = 10 * 60_000;

@Injectable()
export class OutboxDispatcherService
  implements OnApplicationBootstrap, OnApplicationShutdown, IOutboxDispatchTrigger
{
  private readonly logger = new Logger(OutboxDispatcherService.name);
  private dispatching = false;
  private dispatchScheduled = false;
  private dispatchRequested = false;
  private safetySweepTimer?: ReturnType<typeof setInterval>;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private retryDueAt?: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly dispatchOutboxEventsUseCase: DispatchOutboxEventsUseCase,
  ) {}

  onApplicationBootstrap(): void {
    this.scheduleSafetySweep();
    this.requestDispatch('startup');
  }

  onApplicationShutdown(): void {
    if (this.safetySweepTimer) {
      clearInterval(this.safetySweepTimer);
      this.safetySweepTimer = undefined;
    }

    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
      this.retryDueAt = undefined;
    }
  }

  trigger(): void {
    this.requestDispatch('outbox-created');
  }

  requestDispatch(reason: string): void {
    if (this.dispatching) {
      this.dispatchRequested = true;
      return;
    }

    if (this.dispatchScheduled) {
      return;
    }

    this.dispatchScheduled = true;
    setTimeout(() => {
      this.dispatchScheduled = false;
      void this.dispatch(reason);
    }, 0);
  }

  private async dispatch(reason: string): Promise<void> {
    if (this.dispatching) {
      this.dispatchRequested = true;
      return;
    }

    this.dispatching = true;
    const batchSize = this.getPositiveInteger('OUTBOX_DISPATCH_BATCH_SIZE', 25);

    try {
      const result = await this.dispatchOutboxEventsUseCase.execute({
        batchSize,
        staleClaimMs: this.getPositiveInteger('OUTBOX_CLAIM_STALE_MS', 60_000),
      });

      if (result.claimed > 0) {
        this.logger.log(
          `Outbox dispatch reason=${reason} claimed=${result.claimed} published=${result.published} failed=${result.failed}`,
        );
      }

      if (result.claimed >= batchSize) {
        this.dispatchRequested = true;
      }

      if (result.nextRetryDelayMs !== undefined) {
        this.scheduleRetry(result.nextRetryDelayMs);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Outbox dispatch cycle failed: ${message}`);
      this.scheduleRetry(60_000);
    } finally {
      this.dispatching = false;

      if (this.dispatchRequested) {
        this.dispatchRequested = false;
        this.requestDispatch('follow-up');
      }
    }
  }

  private scheduleSafetySweep(): void {
    const intervalMs = this.getSafetySweepMs();

    this.safetySweepTimer = setInterval(() => {
      this.requestDispatch('safety-sweep');
    }, intervalMs);

    this.logger.log(`Outbox safety sweep interval=${intervalMs}ms`);
  }

  private scheduleRetry(delayMs: number): void {
    const normalizedDelayMs = Math.max(1000, Math.floor(delayMs));
    const dueAt = Date.now() + normalizedDelayMs;

    if (this.retryTimer && this.retryDueAt !== undefined && this.retryDueAt <= dueAt) {
      return;
    }

    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
    }

    this.retryDueAt = dueAt;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      this.retryDueAt = undefined;
      this.requestDispatch('retry');
    }, normalizedDelayMs);
  }

  private getSafetySweepMs(): number {
    const value = Number(
      this.configService.get<string>('OUTBOX_SAFETY_SWEEP_MS') ??
        DEFAULT_SAFETY_SWEEP_MS,
    );

    if (!Number.isInteger(value) || value < MIN_SAFETY_SWEEP_MS) {
      return DEFAULT_SAFETY_SWEEP_MS;
    }

    return value;
  }

  private getPositiveInteger(key: string, fallback: number): number {
    const value = Number(this.configService.get<string>(key) ?? fallback);

    return Number.isInteger(value) && value > 0 ? value : fallback;
  }
}
