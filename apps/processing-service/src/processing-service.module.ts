import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { CloudflareAiAdapter } from '@processing/infrastructure/adapters/cloudflare-ai.adapter';
import { ContentServiceAdapter } from '@processing/infrastructure/adapters/content-service.adapter';
import { ProcessReelUseCase } from './application/use-cases/process-reel.use-case';
import { ProcessingController } from './infrastructure/controllers/processing.controller';
import { FfmpegService } from './infrastructure/services/ffmpeg.service';
import { R2Service } from './infrastructure/services/r2.service';

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
              heartbeat: Number.isFinite(heartbeat) && heartbeat > 0 ? heartbeat : 300,
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
    ProcessReelUseCase,
    FfmpegService,
    R2Service,
    {
      provide: 'IAiService',
      useClass: CloudflareAiAdapter,
    },
    {
      provide: 'IContentService',
      useClass: ContentServiceAdapter,
    },
  ],
})
export class ProcessingServiceModule {}
