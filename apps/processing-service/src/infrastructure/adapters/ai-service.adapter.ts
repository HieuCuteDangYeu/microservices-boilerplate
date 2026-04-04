import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import type { IAiService } from '../../domain/interfaces/ai-service.interface';

@Injectable()
export class AiServiceAdapter implements IAiService {
  constructor(@Inject('AI_RMQ') private readonly aiBroker: ClientProxy) {}

  async generateEmbedding(text: string): Promise<number[]> {
    const response = await firstValueFrom(
      this.aiBroker.send<{ embedding: number[] }>('ai.generate_embedding', {
        text,
      }),
    );

    return response.embedding;
  }

  async transcribeAudio(audioBuffer: Buffer): Promise<string> {
    const response = await firstValueFrom(
      this.aiBroker.send<{ transcript: string }>('ai.transcribe_audio', {
        audioBuffer,
      }),
    );
    return response.transcript;
  }
}
