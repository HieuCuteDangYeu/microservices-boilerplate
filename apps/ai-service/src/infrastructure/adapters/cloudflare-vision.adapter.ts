import type { IVisionService } from '@ai/domain/interfaces/vision.service.interface';
import type { VisualFrameAnalysis } from '@common/ai/interfaces/visual-analysis.interface';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface CloudflareAiError {
  message?: string;
  code?: number;
}

interface CloudflareAiResponse {
  success?: boolean;
  result?: {
    answer?: string;
  };
  errors?: Array<CloudflareAiError | string>;
}

interface ParsedVisionAnswer {
  caption?: unknown;
  ocrText?: unknown;
  objects?: unknown;
}

@Injectable()
export class CloudflareVisionAdapter implements IVisionService {
  private readonly endpoint: string;
  private readonly apiToken: string;
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    const accountId = this.configService.getOrThrow<string>(
      'CLOUDFLARE_ACCOUNT_ID',
    );
    this.apiToken = this.configService.getOrThrow<string>(
      'CLOUDFLARE_API_TOKEN',
    );
    this.model =
      this.configService.get<string>('CLOUDFLARE_AI_VISION_MODEL') ||
      '@cf/moondream/moondream3.1-9B-A2B';
    this.endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${this.model}`;
  }

  async analyzeImage(input: {
    image: Uint8Array;
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  }): Promise<VisualFrameAnalysis> {
    const imageBase64 = Buffer.from(input.image).toString('base64');
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        task: 'query',
        image: `data:${input.mimeType};base64,${imageBase64}`,
        question: this.buildQuestion(),
        reasoning: false,
        temperature: 0,
        max_tokens: 700,
        stream: false,
      }),
    });

    const rawBody = await response.text();
    const payload = this.parseEnvelope(rawBody);

    if (!response.ok || !payload.success) {
      throw new Error(
        `Cloudflare Workers AI vision request failed with status ${response.status}: ${this.extractErrorMessage(payload, rawBody)}`,
      );
    }

    const answer = payload.result?.answer?.trim();
    if (!answer) {
      throw new Error('Cloudflare Workers AI vision returned no answer');
    }

    const parsed = this.parseVisionAnswer(answer);
    const caption = this.cleanText(parsed.caption);
    const ocrText = this.cleanText(parsed.ocrText);
    const objects = this.cleanObjects(parsed.objects);

    if (!caption && !ocrText && objects.length === 0) {
      return {
        caption: this.cleanText(answer) || 'No reliable visual details detected.',
        objects: [],
        provider: 'cloudflare-workers-ai',
        model: this.model,
        version: '1',
      };
    }

    return {
      caption: caption || 'No reliable visual description detected.',
      ...(ocrText ? { ocrText } : {}),
      objects,
      provider: 'cloudflare-workers-ai',
      model: this.model,
      version: '1',
    };
  }

  private buildQuestion(): string {
    return [
      'Analyze only what is visibly supported by this single video frame.',
      'Return ONLY valid compact JSON with exactly these keys:',
      '{"caption":"brief factual visual description","ocrText":"all clearly readable on-screen text or empty string","objects":["important visible object or UI element"]}',
      'Do not infer speech, events outside this frame, hidden text, identity, intent, or unsupported facts.',
      'Preserve readable numbers, error messages, commands, labels, prices, usernames, and code text accurately.',
      'If text is uncertain, omit it rather than guessing.',
    ].join(' ');
  }

  private parseEnvelope(rawBody: string): CloudflareAiResponse {
    try {
      return JSON.parse(rawBody) as CloudflareAiResponse;
    } catch {
      return {};
    }
  }

  private parseVisionAnswer(answer: string): ParsedVisionAnswer {
    const stripped = answer
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    try {
      return JSON.parse(stripped) as ParsedVisionAnswer;
    } catch {
      const firstBrace = stripped.indexOf('{');
      const lastBrace = stripped.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        try {
          return JSON.parse(
            stripped.slice(firstBrace, lastBrace + 1),
          ) as ParsedVisionAnswer;
        } catch {
          return { caption: stripped };
        }
      }
      return { caption: stripped };
    }
  }

  private cleanText(value: unknown): string {
    return typeof value === 'string'
      ? value.replace(/\s+/g, ' ').trim().slice(0, 4_000)
      : '';
  }

  private cleanObjects(value: unknown): string[] {
    if (!Array.isArray(value)) return [];

    return [
      ...new Set(
        value
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.replace(/\s+/g, ' ').trim())
          .filter(Boolean),
      ),
    ].slice(0, 30);
  }

  private extractErrorMessage(
    payload: CloudflareAiResponse,
    rawBody: string,
  ): string {
    const messages = (payload.errors ?? [])
      .map((error) =>
        typeof error === 'string'
          ? error
          : error.message || String(error.code ?? ''),
      )
      .filter(Boolean);

    return messages.length > 0
      ? messages.join('; ')
      : rawBody.trim() || 'Unknown Cloudflare Workers AI error';
  }
}
