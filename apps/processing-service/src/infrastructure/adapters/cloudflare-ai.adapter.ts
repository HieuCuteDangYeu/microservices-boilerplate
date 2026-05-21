import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FeatureExtractionPipeline, pipeline } from '@xenova/transformers';
import type { IAiService } from '../../domain/interfaces/ai-service.interface';

interface CloudflareAiError {
  message?: string;
  code?: number;
}

interface CloudflareAiResponse<T> {
  success?: boolean;
  result?: T;
  errors?: Array<CloudflareAiError | string>;
}

interface CloudflareTranscriptionResult {
  text?: string;
}

@Injectable()
export class CloudflareAiAdapter implements IAiService, OnModuleInit {
  private readonly logger = new Logger(CloudflareAiAdapter.name);
  private readonly endpoint: string;
  private readonly apiToken: string;
  private readonly language?: string;
  private extractor: FeatureExtractionPipeline | null = null;

  constructor(private readonly configService: ConfigService) {
    const accountId = this.configService.getOrThrow<string>(
      'CLOUDFLARE_ACCOUNT_ID',
    );
    this.apiToken = this.configService.getOrThrow<string>(
      'CLOUDFLARE_API_TOKEN',
    );
    const model =
      this.configService.get<string>('CLOUDFLARE_AI_TRANSCRIPTION_MODEL') ||
      '@cf/openai/whisper-large-v3-turbo';
    this.language =
      this.configService.get<string>('CLOUDFLARE_AI_TRANSCRIPTION_LANGUAGE') ||
      undefined;
    this.endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
  }

  async onModuleInit(): Promise<void> {
    try {
      this.extractor = await pipeline(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2',
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to initialize embedding model: ${message}`);
    }
  }

  async transcribeAudio(audioBuffer: Buffer): Promise<string> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audio: audioBuffer.toString('base64'),
        task: 'transcribe',
        ...(this.language ? { language: this.language } : {}),
      }),
    });

    const rawBody = await response.text();
    const payload = this.parseResponse(rawBody);

    if (!response.ok) {
      throw new Error(
        `Cloudflare Workers AI request failed with status ${response.status}: ${this.extractErrorMessage(payload, rawBody)}`,
      );
    }

    if (!payload.success || !payload.result?.text) {
      throw new Error(
        `Cloudflare Workers AI transcription failed: ${this.extractErrorMessage(payload, rawBody)}`,
      );
    }

    return payload.result.text;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.extractor) {
      throw new Error('Embedding model not initialized');
    }

    const output = await this.extractor(text, {
      pooling: 'mean',
      normalize: true,
    });

    const vector = Array.from(output.data as Float32Array);

    if (vector.length === 0) {
      throw new Error('Embedding model returned empty vector');
    }

    return vector;
  }

  private parseResponse(
    rawBody: string,
  ): CloudflareAiResponse<CloudflareTranscriptionResult> {
    try {
      return JSON.parse(
        rawBody,
      ) as CloudflareAiResponse<CloudflareTranscriptionResult>;
    } catch {
      return {};
    }
  }

  private extractErrorMessage(
    payload: CloudflareAiResponse<CloudflareTranscriptionResult>,
    rawBody: string,
  ): string {
    const errorMessages = (payload.errors ?? [])
      .map((error) =>
        typeof error === 'string' ? error : error.message || String(error.code),
      )
      .filter((message): message is string => Boolean(message));

    if (errorMessages.length > 0) {
      return errorMessages.join('; ');
    }

    if (rawBody.trim().length > 0) {
      return rawBody;
    }

    return 'Unknown Cloudflare Workers AI error';
  }
}
