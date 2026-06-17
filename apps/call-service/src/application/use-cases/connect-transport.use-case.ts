import { Inject, Injectable } from '@nestjs/common';
import { ICallMediaEngine } from '../../domain/interfaces/call-media.engine.interface';

@Injectable()
export class ConnectTransportUseCase {
  constructor(
    @Inject('ICallMediaEngine') private readonly mediaEngine: ICallMediaEngine,
  ) {}

  async execute(
    callId: string,
    userId: string,
    transportId: string,
    dtlsParameters: Record<string, unknown>,
  ): Promise<void> {
    await this.mediaEngine.connectTransport(
      callId,
      userId,
      transportId,
      dtlsParameters,
    );
  }
}
