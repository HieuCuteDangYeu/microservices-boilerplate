import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import type { IContentService } from '../../domain/interfaces/content-service.interface';

@Injectable()
export class ContentServiceAdapter implements IContentService {
  constructor(
    @Inject('CONTENT_RMQ') private readonly messageBroker: ClientProxy,
  ) {}

  private describeError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === 'object' && error !== null) {
      const record = error as Record<string, unknown>;

      if ('message' in record && typeof record['message'] === 'string') {
        return record['message'];
      }

      if ('err' in record) {
        return this.describeError(record['err']);
      }

      try {
        return JSON.stringify(error);
      } catch {
        return String(error);
      }
    }

    return String(error);
  }

  async emitProcessingStarted(data: {
    reelId: string;
    status: 'PROCESSING';
    stage?: string;
    message?: string;
    progress?: number;
  }): Promise<void> {
    try {
      await firstValueFrom(
        this.messageBroker.emit('reel.processing_started', data),
      );
    } catch (error: unknown) {
      throw new Error(
        `Failed to emit reel.processing_started: ${this.describeError(error)}`,
      );
    }
  }

  async emitProcessingProgress(data: {
    reelId: string;
    status: 'PROCESSING';
    stage?: string;
    message?: string;
    progress?: number;
  }): Promise<void> {
    try {
      await firstValueFrom(
        this.messageBroker.emit('reel.processing_progress', data),
      );
    } catch (error: unknown) {
      throw new Error(
        `Failed to emit reel.processing_progress: ${this.describeError(error)}`,
      );
    }
  }

  async emitProcessingCompleted(data: {
    reelId: string;
    status: 'COMPLETED';
    transcript?: string;
    embedding?: number[];
    thumbnailKey?: string;
    stage?: string;
    message?: string;
    progress?: number;
  }): Promise<void> {
    try {
      await firstValueFrom(
        this.messageBroker.emit('reel.processing_completed', data),
      );
    } catch (error: unknown) {
      throw new Error(
        `Failed to emit reel.processing_completed: ${this.describeError(error)}`,
      );
    }
  }

  async emitProcessingFailed(data: {
    reelId: string;
    status: 'FAILED';
    stage?: string;
    message?: string;
    progress?: number;
  }): Promise<void> {
    try {
      await firstValueFrom(
        this.messageBroker.emit('reel.processing_failed', data),
      );
    } catch (error: unknown) {
      throw new Error(
        `Failed to emit reel.processing_failed: ${this.describeError(error)}`,
      );
    }
  }
}
