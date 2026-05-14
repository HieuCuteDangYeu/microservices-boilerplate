import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import type { IAiService } from '../../domain/interfaces/ai-service.interface';

@Injectable()
export class AiServiceAdapter implements IAiService {
  private static readonly AI_RPC_TIMEOUT_MS = 120_000;

  constructor(@Inject('AI_RMQ') private readonly aiBroker: ClientProxy) {}

  async generateEmbedding(text: string): Promise<number[]> {
    const response = await firstValueFrom(
      this.aiBroker
        .send<{ embedding: number[] }>('ai.generate_embedding', {
          text,
        })
        .pipe(timeout(AiServiceAdapter.AI_RPC_TIMEOUT_MS)),
    );

    return response.embedding;
  }

  async transcribeAudio(audioKey: string): Promise<string> {
    const response = await firstValueFrom(
      this.aiBroker
        .send<{ transcript: string }>('ai.transcribe_audio', {
          audioKey,
        })
        .pipe(timeout(AiServiceAdapter.AI_RPC_TIMEOUT_MS)),
    );
    return response.transcript;
  }
}
