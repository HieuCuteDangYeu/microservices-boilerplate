import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import type { IProcessingService } from '../../domain/interfaces/processing-service.interface';

@Injectable()
export class ProcessingServiceAdapter implements IProcessingService {
  constructor(
    @Inject('PROCESSING_SERVICE') private readonly messageBroker: ClientProxy,
  ) {}

  emitReelCreated(data: {
    reelId: string;
    mediaKey: string;
    userId: string;
  }): void {
    this.messageBroker.emit('reel.created', data);
  }
}
