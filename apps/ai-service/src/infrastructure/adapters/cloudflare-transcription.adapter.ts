import {
  TranscriptSegment,
  TranscriptionResult,
} from '@common/ai/interfaces/transcription-result.interface';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ITranscriptionService,
  TranscriptionOptions,
} from '../../domain/interfaces/transcription.service.interface';

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
  vtt?: string;
  segments?: unknown[];
  word_count?: number;
  transcription_info?: {
    text?: string;
    word_count?: number;
  };
}

@Injectable()
export class CloudflareTranscriptionAdapter implements ITranscriptionService {
  private readonly endpoint: string;
  private readonly apiToken: string;
  private readonly model: string;
  private readonly version: string;
  private readonly timeoutMs: number;
  private readonly language?: string;

  constructor(private readonly configService: ConfigService) {
    const accountId = this.configService.getOrThrow<string>(
      'CLOUDFLARE_ACCOUNT_ID',
    );
    this.apiToken = this.configService.getOrThrow<string>(
      'CLOUDFLARE_API_TOKEN',
    );
    this.model = this.configService.getOrThrow<string>(
      'AI_TRANSCRIPTION_MODEL',
    );
    this.version = this.configService.getOrThrow<string>(
      'AI_TRANSCRIPTION_VERSION',
    );
    this.timeoutMs = this.positiveInt('AI_TRANSCRIPTION_TIMEOUT_MS', 120_000);
    this.language =
      this.configService.get<string>('AI_TRANSCRIPTION_LANGUAGE') || undefined;
    this.endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${this.model}`;
  }

  async transcribeAudio(
    audioBuffer: Buffer,
    options?: TranscriptionOptions,
  ): Promise<TranscriptionResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    timeout.unref();

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
          'cf-aig-skip-cache': 'true',
          ...this.gatewayHeaders(),
        },
        body: JSON.stringify({
          audio: audioBuffer.toString('base64'),
          task: 'transcribe',
          ...(this.language ? { language: this.language } : {}),
          // Reels often include silence, music, and fast cuts. These settings
          // reduce hallucinated carry-over and help focus on spoken audio.
          vad_filter: true,
          condition_on_previous_text: false,
          hallucination_silence_threshold: 2,
          ...(options?.initialPrompt
            ? { initial_prompt: options.initialPrompt }
            : {}),
        }),
      });

      const rawBody = await response.text();
      const payload = this.parseResponse(rawBody);

      if (!response.ok) {
        throw new Error(
          `Cloudflare Workers AI request failed with status ${response.status}: ${this.extractErrorMessage(payload, rawBody)}`,
        );
      }

      if (!payload.success || !payload.result) {
        throw new Error(
          `Cloudflare Workers AI transcription failed: ${this.extractErrorMessage(payload, rawBody)}`,
        );
      }

      const text =
        payload.result.text?.trim() ||
        payload.result.transcription_info?.text?.trim();

      const vtt = payload.result.vtt?.trim() || undefined;
      const segments = this.normalizeSegments(payload.result.segments);
      const wordCount =
        payload.result.word_count ??
        payload.result.transcription_info?.word_count ??
        undefined;

      return {
        // A successful empty transcript is valid for silence, music, and other
        // clips without speech. The indexing pipeline can still index metadata.
        text: text ?? '',
        vtt,
        segments: segments.length > 0 ? segments : undefined,
        wordCount,
        provider: 'cloudflare-workers-ai',
        model: this.model,
        version: this.version,
      };
    } finally {
      clearTimeout(timeout);
    }
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

  private gatewayHeaders(): Record<string, string> {
    const enabled =
      this.configService
        .get<string>('CLOUDFLARE_AI_GATEWAY_ENABLED')
        ?.trim()
        .toLowerCase() !== 'false';
    return enabled
      ? {
          'cf-aig-gateway-id': this.configService.getOrThrow<string>(
            'CLOUDFLARE_AI_GATEWAY_ID',
          ),
        }
      : {};
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

  private normalizeSegments(rawSegments?: unknown[]): TranscriptSegment[] {
    if (!Array.isArray(rawSegments)) {
      return [];
    }

    return rawSegments.flatMap((rawSegment) => {
      if (!rawSegment || typeof rawSegment !== 'object') {
        return [];
      }

      const segment = rawSegment as Record<string, unknown>;
      const start = Number(segment['start']);
      const end = Number(segment['end']);
      const text =
        typeof segment['text'] === 'string' ? segment['text'].trim() : '';

      if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        text.length === 0
      ) {
        return [];
      }

      return [
        {
          ...segment,
          id: typeof segment['id'] === 'number' ? segment['id'] : undefined,
          start,
          end,
          text,
        } satisfies TranscriptSegment,
      ];
    });
  }

  private positiveInt(key: string, max: number): number {
    const value = Number(this.configService.getOrThrow<string>(key));
    if (!Number.isInteger(value) || value < 1 || value > max)
      throw new Error(`Invalid ${key}`);
    return value;
  }
}
