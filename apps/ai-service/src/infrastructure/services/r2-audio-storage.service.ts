import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { buffer } from 'stream/consumers';
import type { Readable } from 'stream';
import type { IAudioStorageService } from '../../domain/interfaces/audio-storage.service.interface';

@Injectable()
export class R2AudioStorageService implements IAudioStorageService {
  private readonly s3Client: S3Client;
  private readonly bucketName: string;

  constructor(private readonly configService: ConfigService) {
    this.bucketName = this.configService.getOrThrow<string>('R2_BUCKET_NAME');
    const accountId = this.configService.getOrThrow<string>('R2_ACCOUNT_ID');

    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: this.configService.getOrThrow<string>('R2_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.getOrThrow<string>(
          'R2_SECRET_ACCESS_KEY',
        ),
      },
      forcePathStyle: true,
    });
  }

  async downloadAudio(audioKey: string): Promise<Buffer> {
    const response = await this.s3Client.send(
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: audioKey,
      }),
    );

    if (!response.Body) {
      throw new Error(`Audio file ${audioKey} was not found in R2`);
    }

    return buffer(response.Body as Readable);
  }
}
