import { GetPresignedUrlUseCase } from '@media/application/use-cases/get-presigned-url.use-case';
import { MediaController } from '@media/infrastructure/controllers/media.controller';
import { S3Service } from '@media/infrastructure/services/s3.service';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'apps/media-service/.env',
    }),
  ],
  controllers: [MediaController],
  providers: [GetPresignedUrlUseCase, S3Service],
})
export class MediaServiceModule {}
