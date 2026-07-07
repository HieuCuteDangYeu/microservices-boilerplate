import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DevPushController } from './dev-push.controller';
import { FirebaseAdminService } from './firebase-admin.service';

@Module({
  imports: [PrismaModule],
  controllers: [DevPushController],
  providers: [FirebaseAdminService],
  exports: [FirebaseAdminService],
})
export class FirebaseAdminModule {}
