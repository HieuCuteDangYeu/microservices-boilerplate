import { GetPresignedUrlUseCase } from '@media/application/use-cases/get-presigned-url.use-case';
import { MediaController } from '@media/infrastructure/controllers/media.controller';
import { S3Service } from '@media/infrastructure/services/s3.service';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ClientsModule.register([
      {
        name: 'MEDIA_RMQ',
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://localhost:5672'],
          queue: 'user_queue',
          queueOptions: { durable: true },
        },
      },
    ]),
  ],
  controllers: [MediaController],
  providers: [GetPresignedUrlUseCase, S3Service],
})
export class MediaServiceModule {}
