import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ApnsVoipService } from './apns-voip.service';
import { DevPushController } from './dev-push.controller';
import { FirebaseAdminService } from './firebase-admin.service';

@Module({
  imports: [PrismaModule],
  controllers: [DevPushController],
  providers: [FirebaseAdminService, ApnsVoipService],
  exports: [FirebaseAdminService, ApnsVoipService],
})
export class FirebaseAdminModule {}
