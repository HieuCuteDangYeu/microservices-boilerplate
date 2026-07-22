import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { EmbedReelChunksUseCase } from '@processing/application/use-cases/embed-reel-chunks.use-case';
import { ClassifyReelMediaUseCase } from '@processing/application/use-cases/classify-reel-media.use-case';
import { NormalizeReelMetadataUseCase } from '@processing/application/use-cases/normalize-reel-metadata.use-case';
import { SelectReelEncodingProfileUseCase } from '@processing/application/use-cases/select-reel-encoding-profile.use-case';
import { ValidateReelIndexUseCase } from '@processing/application/use-cases/validate-reel-index.use-case';
import { ValidateReelSourceMediaUseCase } from '@processing/application/use-cases/validate-reel-source-media.use-case';
import { ValidateReelStreamUseCase } from '@processing/application/use-cases/validate-reel-stream.use-case';
import { AiServiceAdapter } from '@processing/infrastructure/adapters/ai-service.adapter';
import { ContentServiceAdapter } from '@processing/infrastructure/adapters/content-service.adapter';
import { ConversationMediaAdapter } from '@processing/infrastructure/adapters/conversation-media.adapter';
import { LangGraphReelIndexingWorkflowAdapter } from '@processing/infrastructure/adapters/langgraph-reel-indexing-workflow.adapter';
import { ReelMediaRetryPublisherAdapter } from '@processing/infrastructure/adapters/reel-media-retry-publisher.adapter';
import { BuildReelAiMetadataUseCase } from './application/use-cases/build-reel-ai-metadata.use-case';
import { BuildReelEmbeddingTextUseCase } from './application/use-cases/build-reel-embedding-text.use-case';
import { BuildReelSearchIndexUseCase } from './application/use-cases/build-reel-search-index.use-case';
import { BuildReelTranscriptionPromptUseCase } from './application/use-cases/build-reel-transcription-prompt.use-case';
import { BuildTranscriptChunksUseCase } from './application/use-cases/build-transcript-chunks.use-case';
import { PrepareReelMediaUseCase } from './application/use-cases/prepare-reel-media.use-case';
import { ProcessChatVideoUseCase } from './application/use-cases/process-chat-video.use-case';
import { ProcessReelUseCase } from './application/use-cases/process-reel.use-case';
import { ProcessingController } from './infrastructure/controllers/processing.controller';
import { FfmpegService } from './infrastructure/services/ffmpeg.service';
import { JobConcurrencyLimiterService } from './infrastructure/services/job-concurrency-limiter.service';
import { ProcessingMetricsService } from './infrastructure/services/processing-metrics.service';
import { R2Service } from './infrastructure/services/r2.service';
import { TempFileService } from './infrastructure/services/temp-file.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    ClientsModule.registerAsync([
      {
        name: 'CONTENT_RMQ',
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
              queue: 'content_queue',
              queueOptions: { durable: true },
              heartbeat:
                Number.isFinite(heartbeat) && heartbeat > 0 ? heartbeat : 300,
              retryAttempts: 10,
              retryDelay: 3000,
              persistent: true,
            },
          };
        },
        inject: [ConfigService],
      },
      {
        name: 'CONVERSATION_RMQ',
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
              queue: 'conversation_queue',
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
  controllers: [ProcessingController],
  providers: [
    ProcessChatVideoUseCase,
    ProcessReelUseCase,
    BuildReelAiMetadataUseCase,
    BuildReelEmbeddingTextUseCase,
    BuildReelSearchIndexUseCase,
    BuildReelTranscriptionPromptUseCase,
    BuildTranscriptChunksUseCase,
    PrepareReelMediaUseCase,
    ValidateReelStreamUseCase,
    FfmpegService,
    JobConcurrencyLimiterService,
    R2Service,
    TempFileService,
    EmbedReelChunksUseCase,
    NormalizeReelMetadataUseCase,
    ValidateReelIndexUseCase,
    SelectReelEncodingProfileUseCase,
    ClassifyReelMediaUseCase,
    ProcessingMetricsService,
    ReelMediaRetryPublisherAdapter,
    ValidateReelSourceMediaUseCase,
    {
      provide: 'IAiService',
      useClass: AiServiceAdapter,
    },
    {
      provide: 'IContentService',
      useClass: ContentServiceAdapter,
    },
    {
      provide: 'IMediaStorageService',
      useExisting: R2Service,
    },
    {
      provide: 'IVideoProcessingService',
      useExisting: FfmpegService,
    },
    {
      provide: 'ITempFileService',
      useClass: TempFileService,
    },
    {
      provide: 'IJobConcurrencyLimiterService',
      useExisting: JobConcurrencyLimiterService,
    },
    {
      provide: 'IProcessingMetrics',
      useExisting: ProcessingMetricsService,
    },
    {
      provide: 'IReelMediaRetryPublisher',
      useExisting: ReelMediaRetryPublisherAdapter,
    },
    {
      provide: 'IConversationMediaService',
      useClass: ConversationMediaAdapter,
    },
    {
      provide: 'IReelIndexingWorkflow',
      useClass: LangGraphReelIndexingWorkflowAdapter,
    },
  ],
})
export class ProcessingServiceModule {}
