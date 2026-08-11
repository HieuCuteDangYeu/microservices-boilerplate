import {
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { TranscriptionAudioManifest } from '@common/processing/interfaces/transcription-audio-manifest.interface';
import type { VisualFrameManifest } from '@common/processing/interfaces/visual-frame-manifest.interface';
import type { IArtifactStorage } from '@indexing/domain/interfaces/artifact-storage.interface';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class R2ArtifactStorageAdapter implements IArtifactStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(configService: ConfigService) {
    this.bucket = configService.getOrThrow<string>('R2_BUCKET_NAME');
    const accountId = configService.getOrThrow<string>('R2_ACCOUNT_ID');
    const endpoint =
      configService.get<string>('R2_ENDPOINT')?.trim() ||
      `https://${accountId}.r2.cloudflarestorage.com`;

    this.client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId: configService.getOrThrow<string>('R2_ACCESS_KEY_ID'),
        secretAccessKey: configService.getOrThrow<string>(
          'R2_SECRET_ACCESS_KEY',
        ),
      },
      forcePathStyle: true,
    });
  }

  async getTranscriptionAudioManifest(
    key: string,
  ): Promise<TranscriptionAudioManifest> {
    const value = await this.getJsonObject(key);

    if (!this.isTranscriptionManifest(value)) {
      throw new Error(`Transcription audio manifest ${key} is invalid`);
    }

    return value;
  }

  async getVisualFrameManifest(key: string): Promise<VisualFrameManifest> {
    const value = await this.getJsonObject(key);

    if (!this.isVisualFrameManifest(value)) {
      throw new Error(`Visual frame manifest ${key} is invalid`);
    }

    return value;
  }

  async getArtifactBuffer(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!response.Body) {
      throw new Error(`Artifact ${key} was not found`);
    }

    return Buffer.from(await response.Body.transformToByteArray());
  }

  async artifactExists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch (error: unknown) {
      const statusCode =
        typeof error === 'object' &&
        error !== null &&
        '$metadata' in error &&
        typeof error.$metadata === 'object' &&
        error.$metadata !== null &&
        'httpStatusCode' in error.$metadata
          ? Number(error.$metadata.httpStatusCode)
          : undefined;
      if (statusCode === 404) return false;
      throw error;
    }
  }

  private async getJsonObject(key: string): Promise<unknown> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );

    if (!response.Body) {
      throw new Error(`Artifact ${key} was not found`);
    }

    return JSON.parse(await response.Body.transformToString('utf8')) as unknown;
  }

  private isTranscriptionManifest(
    value: unknown,
  ): value is TranscriptionAudioManifest {
    if (typeof value !== 'object' || value === null) return false;
    const record = value as Record<string, unknown>;
    return (
      typeof record['reelId'] === 'string' &&
      typeof record['mediaAttemptId'] === 'string' &&
      typeof record['totalDurationMs'] === 'number' &&
      (record['format'] === 'wav' || record['format'] === 'flac') &&
      record['version'] === 1 &&
      Array.isArray(record['artifacts']) &&
      record['artifacts'].every((artifact) => {
        if (typeof artifact !== 'object' || artifact === null) return false;
        const item = artifact as Record<string, unknown>;
        return (
          typeof item['key'] === 'string' &&
          typeof item['startMs'] === 'number' &&
          typeof item['endMs'] === 'number' &&
          typeof item['overlapBeforeMs'] === 'number' &&
          typeof item['checksum'] === 'string' &&
          typeof item['byteLength'] === 'number'
        );
      })
    );
  }

  private isVisualFrameManifest(value: unknown): value is VisualFrameManifest {
    if (typeof value !== 'object' || value === null) return false;
    const record = value as Record<string, unknown>;
    return (
      typeof record['reelId'] === 'string' &&
      typeof record['mediaAttemptId'] === 'string' &&
      typeof record['totalDurationMs'] === 'number' &&
      record['version'] === 1 &&
      typeof record['sampling'] === 'object' &&
      record['sampling'] !== null &&
      Array.isArray(record['artifacts']) &&
      record['artifacts'].every((artifact) => {
        if (typeof artifact !== 'object' || artifact === null) return false;
        const item = artifact as Record<string, unknown>;
        return (
          typeof item['key'] === 'string' &&
          typeof item['timestampMs'] === 'number' &&
          typeof item['checksum'] === 'string' &&
          typeof item['byteLength'] === 'number' &&
          ['PERIODIC', 'SCENE_CHANGE', 'PERIODIC_AND_SCENE_CHANGE'].includes(
            String(item['reason']),
          )
        );
      })
    );
  }
}
