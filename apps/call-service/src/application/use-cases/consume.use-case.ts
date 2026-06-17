import { Inject, Injectable } from '@nestjs/common';
import { ICallMediaEngine } from '../../domain/interfaces/call-media.engine.interface';

@Injectable()
export class ConsumeUseCase {
  constructor(
    @Inject('ICallMediaEngine') private readonly mediaEngine: ICallMediaEngine,
  ) {}

  async execute(
    callId: string,
    userId: string,
    transportId: string,
    producerId: string,
    rtpCapabilities: Record<string, unknown>,
  ) {
    return this.mediaEngine.consume(
      callId,
      userId,
      transportId,
      producerId,
      rtpCapabilities,
    );
  }
}
