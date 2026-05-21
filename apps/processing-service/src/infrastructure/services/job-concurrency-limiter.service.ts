import { Injectable } from '@nestjs/common';

@Injectable()
export class JobConcurrencyLimiterService {
  private activeCount = 0;
  private readonly waitQueue: Array<() => void> = [];

  async runExclusive<T>(job: () => Promise<T>, limit: number): Promise<T> {
    await this.acquire(limit);

    try {
      return await job();
    } finally {
      this.release();
    }
  }

  private async acquire(limit: number): Promise<void> {
    if (this.activeCount < limit) {
      this.activeCount += 1;
      return;
    }

    await new Promise<void>((resolve) => {
      this.waitQueue.push(() => {
        this.activeCount += 1;
        resolve();
      });
    });
  }

  private release(): void {
    this.activeCount = Math.max(0, this.activeCount - 1);

    const next = this.waitQueue.shift();
    if (next) {
      next();
    }
  }
}
