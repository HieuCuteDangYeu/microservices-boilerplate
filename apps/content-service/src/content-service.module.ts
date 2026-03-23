import { UpdateReelStatusUseCase } from '@content/application/use-cases/update-reel-status.use-case';
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
        name: 'CONTENT_RMQ',
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://localhost:5672'],
          queue: 'content_queue',
          queueOptions: { durable: true },
        },
      },
    ]),
  ],
  controllers: [ContentController],
  providers: [
    CreateReelUseCase,
    UpdateReelStatusUseCase,
    {
      provide: 'IContentRepository',
      useClass: ContentRepository,
    },
  ],
})
export class ContentServiceModule {}
