import { Inject, Injectable } from '@nestjs/common';
import { ICallMediaEngine } from '../../domain/interfaces/call-media.engine.interface';

@Injectable()
export class ResumeConsumerUseCase {
  constructor(
    @Inject('ICallMediaEngine') private readonly mediaEngine: ICallMediaEngine,
  ) {}

  async execute(
    callId: string,
    userId: string,
    consumerId: string,
  ): Promise<void> {
    await this.mediaEngine.resumeConsumer(callId, userId, consumerId);
  }
}
