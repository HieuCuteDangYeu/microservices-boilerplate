import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Transport } from '@nestjs/microservices';
import { MonitoringServiceModule } from './monitoring-service.module';

async function bootstrap() {
  const app = await NestFactory.create(MonitoringServiceModule);
  const configService = app.get(ConfigService);

  app.connectMicroservice({
    transport: Transport.RMQ,
    options: {
      urls: [
        configService.get<string>('RABBITMQ_URL') || 'amqp://localhost:5672',
      ],
      queue: 'monitoring_queue',
      queueOptions: { durable: true },
    },
  });

  await app.startAllMicroservices();
  await app.listen(configService.get<number>('MONITORING_PORT') || 3016);
}

void bootstrap();
