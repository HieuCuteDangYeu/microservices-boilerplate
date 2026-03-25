import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IStorageService } from '../../domain/interfaces/storage.service.interface';

@Injectable()
export class R2StorageService implements IStorageService {
  private s3Client: S3Client;

  constructor(private readonly configService: ConfigService) {
    const accountId = this.configService.get<string>('R2_ACCOUNT_ID');
    const accessKeyId = this.configService.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'R2_SECRET_ACCESS_KEY',
    );

    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: accessKeyId!,
        secretAccessKey: secretAccessKey!,
      },
      forcePathStyle: false,
    });
  }

  async checkFileExists(key: string): Promise<boolean> {
    const bucketName = this.configService.get<string>('R2_BUCKET_NAME');
    const cleanKey = key.replace(/^\/+/, '').trim();

    try {
      await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: bucketName,
          Key: cleanKey,
        }),
      );
      return true;
    } catch (error) {
      console.error('R2 Vault Check Failed:', error);
      return false;
    }
  }
}
