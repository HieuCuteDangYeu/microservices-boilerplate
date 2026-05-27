import { BackfillReelChunksUseCase } from '@content/application/use-cases/backfill-reel-chunks.use-case';
import { DeleteReelUseCase } from '@content/application/use-cases/delete-reel.use-case';
import { GetProfileReelContextUseCase } from '@content/application/use-cases/get-profile-reel-context.use-case';
import { GetReelStatusUseCase } from '@content/application/use-cases/get-reel-status.use-case';
import { GetReelUseCase } from '@content/application/use-cases/get-reel.use-case';
import { IncrementReelViewUseCase } from '@content/application/use-cases/increment-reel-view.use-case';
import { ListReelsUseCase } from '@content/application/use-cases/list-reels.use-case';
import { SearchTranscriptsUseCase } from '@content/application/use-cases/search-transcripts.use-case';
import { UpdateReelStatusUseCase } from '@content/application/use-cases/update-reel-status.use-case';
import { UpdateReelUseCase } from '@content/application/use-cases/update-reel.use-case';
import { AiEmbeddingServiceAdapter } from '@content/infrastructure/adapters/ai-embedding-service.adapter';
import { ProcessingServiceAdapter } from '@content/infrastructure/adapters/processing-service.adapter';
import { R2StorageService } from '@content/infrastructure/services/r2-storage.service';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { CreateReelUseCase } from './application/use-cases/create-reel.use-case';
import { ContentController } from './infrastructure/controllers/content.controller';
import { ContentRepository } from './infrastructure/repositories/content.repository';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ClientsModule.registerAsync([
      {
        name: 'PROCESSING_SERVICE',
        useFactory: (configService: ConfigService) => {
          const heartbeat = Number(
            configService.get<string>('RABBITMQ_HEARTBEAT_SECONDS') ?? '300',
          );

          return {
            transport: Transport.RMQ,
            options: {
              urls: [
                configService.get<string>('RABBITMQ_URL') ||
                  'amqp://localhost:5672',
              ],
              queue: 'processing_queue',
              queueOptions: { durable: true },
              heartbeat:
                Number.isFinite(heartbeat) && heartbeat > 0 ? heartbeat : 300,
              retryAttempts: 10,
              retryDelay: 3000,
            },
          };
        },
        inject: [ConfigService],
      },
      {
        name: 'AI_SERVICE_RMQ',
        useFactory: (configService: ConfigService) => {
          const heartbeat = Number(
            configService.get<string>('RABBITMQ_HEARTBEAT_SECONDS') ?? '300',
          );

          return {
            transport: Transport.RMQ,
            options: {
              urls: [
                configService.get<string>('RABBITMQ_URL') ||
                  'amqp://localhost:5672',
              ],
              queue: 'ai_queue',
              queueOptions: { durable: true },
              heartbeat:
                Number.isFinite(heartbeat) && heartbeat > 0 ? heartbeat : 300,
              retryAttempts: 10,
              retryDelay: 3000,
            },
          };
        },
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [ContentController],
  providers: [
    CreateReelUseCase,
    ListReelsUseCase,
    GetReelUseCase,
    GetProfileReelContextUseCase,
    IncrementReelViewUseCase,
    UpdateReelUseCase,
    DeleteReelUseCase,
    UpdateReelStatusUseCase,
    GetReelStatusUseCase,
    SearchTranscriptsUseCase,
    BackfillReelChunksUseCase,
    {
      provide: 'IContentRepository',
      useClass: ContentRepository,
    },
    {
      provide: 'IStorageService',
      useClass: R2StorageService,
    },
    {
      provide: 'IProcessingService',
      useClass: ProcessingServiceAdapter,
    },
    {
      provide: 'IAiEmbeddingService',
      useClass: AiEmbeddingServiceAdapter,
    },
  ],
})
export class ContentServiceModule {}
