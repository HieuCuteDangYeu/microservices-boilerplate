import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ProcessingServiceModule } from 'apps/processing-service/src/processing-service.module';

async function bootstrap() {
  const heartbeat = Number(process.env.RABBITMQ_HEARTBEAT_SECONDS ?? '300');

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    ProcessingServiceModule,
    {
      transport: Transport.RMQ,
      options: {
        urls: [process.env.RABBITMQ_URL || 'amqp://localhost:5672'],
        queue: 'processing_queue',
        queueOptions: { durable: true },
        heartbeat: Number.isFinite(heartbeat) && heartbeat > 0 ? heartbeat : 300,
        retryAttempts: 10,
        retryDelay: 3000,
      },
    },
  );

  await app.listen();
}
void bootstrap();
