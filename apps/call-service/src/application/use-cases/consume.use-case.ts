import { Inject, Injectable } from '@nestjs/common';
import { ICallMediaEngine } from '../../domain/interfaces/call-media.engine.interface';

@Injectable()
export class ConsumeUseCase {
  constructor(
    @Inject('ICallMediaEngine') private readonly mediaEngine: ICallMediaEngine,
  ) {}

  async execute(roomId: string, userId: string, producerId: string) {
    return this.mediaEngine.consume(roomId, userId, producerId);
  }
}
