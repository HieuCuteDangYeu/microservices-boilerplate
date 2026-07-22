import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import type { IProcessingService } from '../../domain/interfaces/processing-service.interface';

@Injectable()
export class ProcessingServiceAdapter implements IProcessingService {
  constructor(
    @Inject('PROCESSING_SERVICE') private readonly messageBroker: ClientProxy,
  ) {}

  private safeStringify(value: unknown): string {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  private describeError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === 'object' && error !== null) {
      const record = error as Record<string, unknown>;

      if (typeof record['message'] === 'string') {
        return record['message'];
      }

      if ('err' in record) {
        return this.describeError(record['err']);
      }

      if ('error' in record) {
        return this.describeError(record['error']);
      }

      return this.safeStringify(error);
    }

    return String(error);
  }

  async emitReelCreated(data: {
    reelId: string;
    mediaKey: string;
    userId: string;
    processingAttemptId: string;
    queuedAt: string;
    title?: string;
    description?: string;
    tags: string[];
  }): Promise<void> {
    try {
      await firstValueFrom(this.messageBroker.emit('reel.created', data));
    } catch (error: unknown) {
      throw new Error(
        `Failed to publish reel.created event: ${this.describeError(error)}`,
      );
    }
  }
}
