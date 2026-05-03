import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import type { IContentService } from '../../domain/interfaces/content-service.interface';

@Injectable()
export class ContentServiceAdapter implements IContentService {
  constructor(
    @Inject('CONTENT_RMQ') private readonly messageBroker: ClientProxy,
  ) {}

  emitProcessingStarted(data: { reelId: string; status: 'PROCESSING' }): void {
    this.messageBroker.emit('reel.processing_started', data);
  }

  emitProcessingCompleted(data: {
    reelId: string;
    status: 'COMPLETED';
    transcript?: string;
    embedding?: number[];
    thumbnailKey?: string;
  }): void {
    this.messageBroker.emit('reel.processing_completed', data);
  }

  emitProcessingFailed(data: { reelId: string; status: 'FAILED' }): void {
    this.messageBroker.emit('reel.processing_failed', data);
  }
}
