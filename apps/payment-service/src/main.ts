import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { PaymentServiceModule } from './payment-service.module';

async function bootstrap() {
  const app = await NestFactory.create(PaymentServiceModule, {
    rawBody: true,
  });

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: {
      host: '0.0.0.0',
      port: 3005,
    },
  });

  await app.startAllMicroservices();
  await app.listen(3006);

  console.log('Payment Service TCP listening on port 3005');
  console.log('Payment Service HTTP (Webhooks) listening on port 3006');
}
void bootstrap();
