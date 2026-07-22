import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { TranscriptionAudioManifest } from '@common/processing/interfaces/transcription-audio-manifest.interface';
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
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );

    if (!response.Body) {
      throw new Error(`Transcription audio manifest ${key} was not found`);
    }

    const value = JSON.parse(
      await response.Body.transformToString('utf8'),
    ) as unknown;

    if (!this.isManifest(value)) {
      throw new Error(`Transcription audio manifest ${key} is invalid`);
    }

    return value;
  }

  private isManifest(value: unknown): value is TranscriptionAudioManifest {
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
}
