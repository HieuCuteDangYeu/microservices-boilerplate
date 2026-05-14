import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import type { IContentService } from '../../domain/interfaces/content-service.interface';
import { createRmqError } from './rmq-error.util';

@Injectable()
export class ContentServiceAdapter implements IContentService {
  constructor(
    @Inject('CONTENT_RMQ') private readonly messageBroker: ClientProxy,
  ) {}

  async emitProcessingStarted(data: {
    reelId: string;
    status: 'PROCESSING';
  }): Promise<void> {
    try {
      await firstValueFrom(
        this.messageBroker.emit('reel.processing_started', data),
      );
    } catch (error: unknown) {
      throw createRmqError('Failed to emit reel.processing_started', error);
    }
  }

  async emitProcessingCompleted(data: {
    reelId: string;
    status: 'COMPLETED';
    transcript?: string;
    embedding?: number[];
    thumbnailKey?: string;
  }): Promise<void> {
    try {
      await firstValueFrom(
        this.messageBroker.emit('reel.processing_completed', data),
      );
    } catch (error: unknown) {
      throw createRmqError('Failed to emit reel.processing_completed', error);
    }
  }

  async emitProcessingFailed(data: {
    reelId: string;
    status: 'FAILED';
  }): Promise<void> {
    try {
      await firstValueFrom(
        this.messageBroker.emit('reel.processing_failed', data),
      );
    } catch (error: unknown) {
      throw createRmqError('Failed to emit reel.processing_failed', error);
    }
  }
}
