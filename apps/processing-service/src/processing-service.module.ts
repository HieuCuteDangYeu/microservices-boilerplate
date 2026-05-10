import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AiServiceAdapter } from '@processing/infrastructure/adapters/ai-service.adapter';
import { ContentServiceAdapter } from '@processing/infrastructure/adapters/content-service.adapter';
import { ProcessReelUseCase } from './application/use-cases/process-reel.use-case';
import { ProcessingController } from './infrastructure/controllers/processing.controller';
import { FfmpegService } from './infrastructure/services/ffmpeg.service';
import { R2Service } from './infrastructure/services/r2.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    ClientsModule.register([
      {
        name: 'CONTENT_RMQ',
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://localhost:5672'],
          queue: 'content_queue',
          queueOptions: { durable: true },
        },
      },
      {
        name: 'AI_RMQ',
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://localhost:5672'],
          queue: 'ai_queue',
          queueOptions: { durable: true },
        },
      },
    ]),
  ],
  controllers: [ProcessingController],
  providers: [
    ProcessReelUseCase,
    FfmpegService,
    R2Service,
    {
      provide: 'IAiService',
      useClass: AiServiceAdapter,
    },
    {
      provide: 'IContentService',
      useClass: ContentServiceAdapter,
    },
  ],
})
export class ProcessingServiceModule {}
