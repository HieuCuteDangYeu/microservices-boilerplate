import {
  DeleteObjectsCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IStorageService } from '../../domain/interfaces/storage.service.interface';

@Injectable()
export class R2StorageService implements IStorageService {
  private s3Client: S3Client;

  constructor(private readonly configService: ConfigService) {
    const accountId = this.configService.get<string>('R2_ACCOUNT_ID')?.trim();
    const accessKeyId = this.configService
      .get<string>('R2_ACCESS_KEY_ID')
      ?.trim();
    const secretAccessKey = this.configService
      .get<string>('R2_SECRET_ACCESS_KEY')
      ?.trim();
    const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;

    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: endpoint,
      credentials: {
        accessKeyId: accessKeyId!,
        secretAccessKey: secretAccessKey!,
      },
      forcePathStyle: true,
    });
  }

  async checkFileExists(key: string): Promise<boolean> {
    const bucketName = this.configService.get<string>('R2_BUCKET_NAME')?.trim();
    const cleanKey = key.replace(/^\/+/, '').trim();

    try {
      await this.s3Client.send(
        new HeadObjectCommand({ Bucket: bucketName, Key: cleanKey }),
      );
      return true;
    } catch (error) {
      console.error('R2 Vault Check Failed for Reel:', error);
      return false;
    }
  }

  async deleteObjects(keys: string[]): Promise<void> {
    const bucketName = this.configService.get<string>('R2_BUCKET_NAME')?.trim();
    const filtered = keys
      .map((k) => k.replace(/^\/+/, '').trim())
      .filter((k) => k.length > 0);

    if (filtered.length === 0) return;

    await this.s3Client.send(
      new DeleteObjectsCommand({
        Bucket: bucketName,
        Delete: {
          Objects: filtered.map((Key) => ({ Key })),
          Quiet: true,
        },
      }),
    );
  }

  async listObjects(prefix: string): Promise<string[]> {
    const bucketName = this.configService.get<string>('R2_BUCKET_NAME')?.trim();
    const cleanPrefix = prefix.replace(/^\/+/, '').trim();
    const keys: string[] = [];
    let continuationToken: string | undefined;

    do {
      const response = await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: bucketName,
          Prefix: cleanPrefix,
          ContinuationToken: continuationToken,
        }),
      );

      for (const obj of response.Contents ?? []) {
        if (obj.Key) keys.push(obj.Key);
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return keys;
  }
}
