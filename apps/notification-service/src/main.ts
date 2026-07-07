import { NestFactory } from '@nestjs/core';

import { NotificationServiceModule } from './notification-service.module';

async function bootstrap() {
  const app = await NestFactory.create(NotificationServiceModule);

  const port = Number(process.env.NOTIFICATION_SERVICE_PORT ?? 3015);

  await app.listen(port);
  console.log(`notification-service listening on port ${port}`);
}

void bootstrap();
