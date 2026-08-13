import { DispatchOutboxEventsUseCase } from '@content/application/use-cases/dispatch-outbox-events.use-case';
import { ConfigService } from '@nestjs/config';
import { OutboxDispatcherService } from './outbox-dispatcher.service';

describe('OutboxDispatcherService', () => {
  const createService = (input?: {
    config?: Record<string, string>;
    results?: Array<{
      claimed: number;
      published: number;
      failed: number;
      nextRetryDelayMs?: number;
    }>;
  }) => {
    const config = input?.config ?? {};
    const configService = {
      get: jest.fn((key: string) => config[key]),
    } as unknown as ConfigService;
    const execute = jest.fn();

    for (const result of input?.results ?? [
      { claimed: 0, published: 0, failed: 0 },
    ]) {
      execute.mockResolvedValueOnce(result);
    }

    execute.mockResolvedValue({ claimed: 0, published: 0, failed: 0 });

    const service = new OutboxDispatcherService(
      configService,
      { execute } as unknown as DispatchOutboxEventsUseCase,
    );

    return { service, execute };
  };

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not poll Postgres every second and uses the 30 minute safety sweep', async () => {
    const { service, execute } = createService();

    service.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(0);
    expect(execute).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(29 * 60_000);
    expect(execute).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(60_000);
    expect(execute).toHaveBeenCalledTimes(2);

    service.onApplicationShutdown();
  });

  it('rejects safety sweep values below ten minutes', async () => {
    const { service, execute } = createService({
      config: { OUTBOX_SAFETY_SWEEP_MS: '1000' },
    });

    service.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(0);
    expect(execute).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(10 * 60_000);
    expect(execute).toHaveBeenCalledTimes(1);

    service.onApplicationShutdown();
  });

  it('coalesces multiple outbox-created wake signals into one dispatch', async () => {
    const { service, execute } = createService();

    service.trigger();
    service.trigger();
    service.trigger();

    await jest.advanceTimersByTimeAsync(0);
    expect(execute).toHaveBeenCalledTimes(1);

    service.onApplicationShutdown();
  });

  it('schedules a retry using the publish backoff returned by the use case', async () => {
    const { service, execute } = createService({
      results: [
        {
          claimed: 1,
          published: 0,
          failed: 1,
          nextRetryDelayMs: 4000,
        },
        { claimed: 0, published: 0, failed: 0 },
      ],
    });

    service.trigger();
    await jest.advanceTimersByTimeAsync(0);
    expect(execute).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(3999);
    expect(execute).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1);
    expect(execute).toHaveBeenCalledTimes(2);

    service.onApplicationShutdown();
  });

  it('immediately continues draining when a full batch was claimed', async () => {
    const { service, execute } = createService({
      config: { OUTBOX_DISPATCH_BATCH_SIZE: '2' },
      results: [
        { claimed: 2, published: 2, failed: 0 },
        { claimed: 0, published: 0, failed: 0 },
      ],
    });

    service.trigger();
    await jest.advanceTimersByTimeAsync(0);

    expect(execute).toHaveBeenCalledTimes(2);
    service.onApplicationShutdown();
  });
});
