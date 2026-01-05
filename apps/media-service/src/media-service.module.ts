import { GetPresignedUrlUseCase } from '@media/application/use-cases/get-presigned-url.use-case';
import { SaveMediaUseCase } from '@media/application/use-cases/save-media.use-case';
import { UserIntegrationAdapter } from '@media/infrastructure/adapters/user-integration.adapter';
import { MediaController } from '@media/infrastructure/controllers/media.controller';
import { MediaRepository } from '@media/infrastructure/repositories/media.repository';
import { S3Service } from '@media/infrastructure/services/s3.service';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['apps/media-service/.env', '.env'],
    }),
    ClientsModule.register([
      {
        name: 'MEDIA_RMQ',
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || ''],
          queue: 'user_queue',
          queueOptions: { durable: true },
        },
      },
    ]),
  ],
  controllers: [MediaController],
  providers: [
    GetPresignedUrlUseCase,
    S3Service,
    GetPresignedUrlUseCase,
    SaveMediaUseCase,
    {
      provide: 'IMediaRepository',
      useClass: MediaRepository,
    },
    {
      provide: 'IUserIntegrationService',
      useClass: UserIntegrationAdapter,
    },
  ],
})
export class MediaServiceModule {}
