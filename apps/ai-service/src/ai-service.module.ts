import { GenerateEmbeddingUseCase } from '@ai/application/use-cases/generate-embedding.use-case';
import { TranscribeAudioUseCase } from '@ai/application/use-cases/transcribe-audio.use-case';
import { XenovaEmbeddingAdapter } from '@ai/infrastructure/adapters/xenova-embedding.adapter';
import { XenovaTranscriptionAdapter } from '@ai/infrastructure/adapters/xenova-transcription.adapter';
import { AiController } from '@ai/infrastructure/controller/ai.controller';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [AiController],
  providers: [
    GenerateEmbeddingUseCase,
    TranscribeAudioUseCase,
    {
      provide: 'IEmbeddingService',
      useClass: XenovaEmbeddingAdapter,
    },
    {
      provide: 'ITranscriptionService',
      useClass: XenovaTranscriptionAdapter,
    },
  ],
})
export class AiServiceModule {}
