import { DeleteReelUseCase } from '@content/application/use-cases/delete-reel.use-case';
import { GetReelStatusUseCase } from '@content/application/use-cases/get-reel-status.use-case';
import { GetReelUseCase } from '@content/application/use-cases/get-reel.use-case';
import { ListReelsUseCase } from '@content/application/use-cases/list-reels.use-case';
import { SearchTranscriptsUseCase } from '@content/application/use-cases/search-transcripts.use-case';
import { UpdateReelStatusUseCase } from '@content/application/use-cases/update-reel-status.use-case';
import { UpdateReelUseCase } from '@content/application/use-cases/update-reel.use-case';
import { ProcessingServiceAdapter } from '@content/infrastructure/adapters/processing-service.adapter';
import { R2StorageService } from '@content/infrastructure/services/r2-storage.service';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
    ClientsModule.register([
      {
        name: 'PROCESSING_SERVICE',
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://localhost:5672'],
          queue: 'processing_queue',
          queueOptions: { durable: true },
          heartbeat: 60,
          retryAttempts: 10,
          retryDelay: 3000,
        },
      },
    ]),
  ],
  controllers: [ContentController],
  providers: [
    CreateReelUseCase,
    ListReelsUseCase,
    GetReelUseCase,
    UpdateReelUseCase,
    DeleteReelUseCase,
    UpdateReelStatusUseCase,
    GetReelStatusUseCase,
    SearchTranscriptsUseCase,
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
  ],
})
export class ContentServiceModule {}
