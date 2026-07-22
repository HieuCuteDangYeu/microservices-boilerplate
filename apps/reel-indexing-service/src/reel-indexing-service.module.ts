import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { BuildHierarchicalIndexUseCase } from './application/use-cases/build-hierarchical-index.use-case';
import { BuildTranscriptSectionsUseCase } from './application/use-cases/build-transcript-sections.use-case';
import { ExtractHierarchicalMetadataUseCase } from './application/use-cases/extract-hierarchical-metadata.use-case';
import { MergeTranscriptSegmentsUseCase } from './application/use-cases/merge-transcript-segments.use-case';
import { ProcessReelIndexJobUseCase } from './application/use-cases/process-reel-index-job.use-case';
import { TranscribeAudioManifestUseCase } from './application/use-cases/transcribe-audio-manifest.use-case';
import { AiServiceAdapter } from './infrastructure/adapters/ai-service.adapter';
import { ContentServiceAdapter } from './infrastructure/adapters/content-service.adapter';
import { R2ArtifactStorageAdapter } from './infrastructure/adapters/r2-artifact-storage.adapter';
import { ReelIndexRetryPublisherAdapter } from './infrastructure/adapters/reel-index-retry-publisher.adapter';
import { ReelIndexingController } from './infrastructure/controllers/reel-indexing.controller';
import { PrismaService } from './infrastructure/prisma/prisma.service';
import { PrismaIndexCheckpointRepository } from './infrastructure/repositories/prisma-index-checkpoint.repository';

const rabbitClient = (name: string, queue: string) => ({
  name,
  useFactory: (config: ConfigService) => {
    const parsedHeartbeat = Number(
      config.get<string>('RABBITMQ_HEARTBEAT_SECONDS') ?? '300',
    );
    return {
      transport: Transport.RMQ as const,
      options: {
        urls: [config.get<string>('RABBITMQ_URL') || 'amqp://localhost:5672'],
        queue,
        queueOptions: { durable: true },
        heartbeat:
          Number.isFinite(parsedHeartbeat) && parsedHeartbeat > 0
            ? parsedHeartbeat
            : 300,
        retryAttempts: 10,
        retryDelay: 3000,
        persistent: true,
      },
    };
  },
  inject: [ConfigService],
});

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    ClientsModule.registerAsync([
      rabbitClient('AI_SERVICE_RMQ', 'ai_queue'),
      rabbitClient('CONTENT_SERVICE_RMQ', 'content_queue'),
    ]),
  ],
  controllers: [ReelIndexingController],
  providers: [
    PrismaService,
    TranscribeAudioManifestUseCase,
    MergeTranscriptSegmentsUseCase,
    BuildTranscriptSectionsUseCase,
    ExtractHierarchicalMetadataUseCase,
    BuildHierarchicalIndexUseCase,
    ProcessReelIndexJobUseCase,
    AiServiceAdapter,
    ContentServiceAdapter,
    R2ArtifactStorageAdapter,
    ReelIndexRetryPublisherAdapter,
    PrismaIndexCheckpointRepository,
    { provide: 'IIndexingAiService', useExisting: AiServiceAdapter },
    { provide: 'IIndexingContentService', useExisting: ContentServiceAdapter },
    { provide: 'IArtifactStorage', useExisting: R2ArtifactStorageAdapter },
    {
      provide: 'IReelIndexRetryPublisher',
      useExisting: ReelIndexRetryPublisherAdapter,
    },
    {
      provide: 'IIndexCheckpointRepository',
      useExisting: PrismaIndexCheckpointRepository,
    },
  ],
})
export class ReelIndexingServiceModule {}
