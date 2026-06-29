import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
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

type UploadFile = {
  absolutePath: string;
  relativeKey: string;
};

const HLS_PLAYLIST_CACHE_CONTROL =
  'public, max-age=60, stale-while-revalidate=30';

const IMMUTABLE_MEDIA_CACHE_CONTROL = 'public, max-age=31536000, immutable';

const getContentType = (fileName: string): string => {
  const lowerName = fileName.toLowerCase();

  if (lowerName.endsWith('.m3u8')) {
    return 'application/vnd.apple.mpegurl';
  }

  if (lowerName.endsWith('.ts')) {
    return 'video/mp2t';
  }

  if (lowerName.endsWith('.m4s')) {
    return 'video/iso.segment';
  }

  if (lowerName.endsWith('.mp4')) {
    return 'video/mp4';
  }

  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) {
    return 'image/jpeg';
  }

  if (lowerName.endsWith('.png')) {
    return 'image/png';
  }

  return 'application/octet-stream';
};

const getCacheControl = (fileName: string): string => {
  const lowerName = fileName.toLowerCase();

  if (lowerName.endsWith('.m3u8')) {
    return HLS_PLAYLIST_CACHE_CONTROL;
  }

  return IMMUTABLE_MEDIA_CACHE_CONTROL;
};

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

  async deleteObjectsByPrefix(prefix: string): Promise<void> {
    const cleanPrefix = prefix.replace(/^\/+/, '').trim();

    if (!cleanPrefix) {
      return;
    }

    const keys = await this.listObjectKeys(`${cleanPrefix}/`);

    if (keys.length === 0) {
      return;
    }

    for (let index = 0; index < keys.length; index += 1000) {
      const chunk = keys.slice(index, index + 1000);

      await this.s3Client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucketName,
          Delete: {
            Objects: chunk.map((Key) => ({ Key })),
            Quiet: true,
          },
        }),
      );
    }
  }

  async uploadHlsDirectory(localDir: string, s3Prefix: string): Promise<void> {
    const files = this.listFilesRecursively(localDir);

    await this.uploadWithConcurrency(files, 8, async (file) => {
      const fileStream = fs.createReadStream(file.absolutePath);
      const normalizedRelativeKey = file.relativeKey.split(path.sep).join('/');

      const key = `${s3Prefix}/${normalizedRelativeKey}`;
      const fileName = path.basename(file.absolutePath);

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: fileStream,
        ContentType: getContentType(fileName),
        CacheControl: getCacheControl(fileName),
      });

      await this.s3Client.send(command);
    });
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
      CacheControl: IMMUTABLE_MEDIA_CACHE_CONTROL,
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

  private async listObjectKeys(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;

    do {
      const response = await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: this.bucketName,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );

      for (const object of response.Contents ?? []) {
        if (object.Key) {
          keys.push(object.Key);
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return keys;
  }

  private listFilesRecursively(directory: string): UploadFile[] {
    const files: UploadFile[] = [];

    const walk = (currentDirectory: string) => {
      const entries = fs.readdirSync(currentDirectory, {
        withFileTypes: true,
      });

      for (const entry of entries) {
        const absolutePath = path.join(currentDirectory, entry.name);

        if (entry.isDirectory()) {
          walk(absolutePath);
          continue;
        }

        if (!entry.isFile()) {
          continue;
        }

        files.push({
          absolutePath,
          relativeKey: path.relative(directory, absolutePath),
        });
      }
    };

    walk(directory);

    return files;
  }

  private async uploadWithConcurrency<T>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<void>,
  ): Promise<void> {
    const executing = new Set<Promise<void>>();

    for (const item of items) {
      const promise = worker(item).finally(() => {
        executing.delete(promise);
      });

      executing.add(promise);

      if (executing.size >= concurrency) {
        await Promise.race(executing);
      }
    }

    await Promise.all(executing);
  }
}
