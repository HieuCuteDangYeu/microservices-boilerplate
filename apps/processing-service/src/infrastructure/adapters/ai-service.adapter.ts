import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import type { IAiService } from '../../domain/interfaces/ai-service.interface';
import { createRmqError } from './rmq-error.util';

@Injectable()
export class AiServiceAdapter implements IAiService {
  private readonly aiRpcTimeoutMs: number;

  constructor(
    @Inject('AI_RMQ') private readonly aiBroker: ClientProxy,
    private readonly configService: ConfigService,
  ) {
    const configuredTimeoutMs = Number(
      this.configService.get<string>('AI_RPC_TIMEOUT_MS') ?? '300000',
    );
    this.aiRpcTimeoutMs =
      Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0
        ? configuredTimeoutMs
        : 300_000;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await firstValueFrom(
        this.aiBroker
          .send<{ embedding: number[] }>('ai.generate_embedding', {
            text,
          })
          .pipe(timeout(this.aiRpcTimeoutMs)),
      );

      return response.embedding;
    } catch (error: unknown) {
      throw createRmqError('AI embedding request failed', error);
    }
  }

  async transcribeAudio(audioKey: string): Promise<string> {
    try {
      const response = await firstValueFrom(
        this.aiBroker
          .send<{ transcript: string }>('ai.transcribe_audio', {
            audioKey,
          })
          .pipe(timeout(this.aiRpcTimeoutMs)),
      );
      return response.transcript;
    } catch (error: unknown) {
      throw createRmqError('AI transcription request failed', error);
    }
  }
}
