import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ITranscriptionService } from '../../domain/interfaces/transcription.service.interface';

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
export class CloudflareTranscriptionAdapter implements ITranscriptionService {
  private readonly endpoint: string;
  private readonly apiToken: string;
  private readonly model: string;
  private readonly language?: string;

  constructor(private readonly configService: ConfigService) {
    const accountId = this.configService.getOrThrow<string>(
      'CLOUDFLARE_ACCOUNT_ID',
    );
    this.apiToken = this.configService.getOrThrow<string>(
      'CLOUDFLARE_API_TOKEN',
    );
    this.model =
      this.configService.get<string>('CLOUDFLARE_AI_TRANSCRIPTION_MODEL') ||
      '@cf/openai/whisper-large-v3-turbo';
    this.language =
      this.configService.get<string>('CLOUDFLARE_AI_TRANSCRIPTION_LANGUAGE') ||
      undefined;
    this.endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${this.model}`;
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
