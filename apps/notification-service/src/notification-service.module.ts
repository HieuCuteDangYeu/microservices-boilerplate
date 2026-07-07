import { Module } from '@nestjs/common';
import { FirebaseAdminModule } from 'apps/notification-service/src/firebase-admin/firebase-admin.module';
import { NotificationJobsModule } from 'apps/notification-service/src/notification-jobs/notification-jobs.module';
import { PushNotificationsModule } from 'apps/notification-service/src/push-notifications/push-notifications.module';

import { PrismaModule } from 'apps/notification-service/src/prisma/prisma.module';
import { PushTokensModule } from 'apps/notification-service/src/push-tokens/push-tokens.module';

@Module({
  imports: [
    PrismaModule,
    PushTokensModule,
    NotificationJobsModule,
    FirebaseAdminModule,
    PushNotificationsModule,
  ],
})
export class NotificationServiceModule {}
