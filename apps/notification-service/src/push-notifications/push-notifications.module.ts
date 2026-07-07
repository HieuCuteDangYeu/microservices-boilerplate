import { Module } from '@nestjs/common';

import { FirebaseAdminModule } from '../firebase-admin/firebase-admin.module';
import { NotificationJobsModule } from '../notification-jobs/notification-jobs.module';
import { PushTokensModule } from '../push-tokens/push-tokens.module';
import { InternalNotificationsController } from './internal-notifications.controller';
import { NotificationRetryService } from './notification-retry.service';
import { PushNotificationsService } from './push-notifications.service';

@Module({
  imports: [PushTokensModule, NotificationJobsModule, FirebaseAdminModule],
  controllers: [InternalNotificationsController],
  providers: [PushNotificationsService, NotificationRetryService],
})
export class PushNotificationsModule {}
