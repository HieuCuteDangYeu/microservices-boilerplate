import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import type {
  IMediaStorageService,
  UploadedThumbnail,
} from '@processing/domain/interfaces/media-storage.service.interface';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';
import { pipeline } from 'stream/promises';

@Injectable()
export class R2Service implements IMediaStorageService {
  private readonly s3Client: S3Client;
  private readonly bucketName = process.env.R2_BUCKET_NAME!;
  private readonly publicDomain = process.env.R2_PUBLIC_DOMAIN!.replace(
    /\/+$/,
    '',
  );

  constructor() {
    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
      requestHandler: new NodeHttpHandler({
        httpsAgent: new https.Agent({ family: 4 }),
      }),
    });
  }

  async downloadVideo(key: string, downloadPath: string): Promise<void> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    const response = await this.s3Client.send(command);

    fs.mkdirSync(path.dirname(downloadPath), { recursive: true });

    if (response.Body) {
      await pipeline(
        response.Body as NodeJS.ReadableStream,
        fs.createWriteStream(downloadPath),
      );
    }
  }

  async uploadHlsDirectory(localDir: string, s3Prefix: string): Promise<void> {
    const files = fs.readdirSync(localDir);

    const uploadPromises = files.map(async (fileName) => {
      const filePath = path.join(localDir, fileName);
      const fileStream = fs.createReadStream(filePath);

      const contentType = fileName.endsWith('.m3u8')
        ? 'application/vnd.apple.mpegurl'
        : 'video/MP2T';

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: `${s3Prefix}/${fileName}`,
        Body: fileStream,
        ContentType: contentType,
      });

      return this.s3Client.send(command);
    });

    await Promise.all(uploadPromises);
  }

  async uploadThumbnail(
    localPath: string,
    s3Key: string,
  ): Promise<UploadedThumbnail> {
    const fileBuffer = fs.readFileSync(localPath);
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: 'image/jpeg',
    });
    await this.s3Client.send(command);

    return {
      key: s3Key,
      url: this.getPublicUrl(s3Key),
    };
  }

  getPublicUrl(key: string): string {
    const normalizedKey = key.replace(/^\/+/, '');
    return `${this.publicDomain}/${normalizedKey}`;
  }
}
