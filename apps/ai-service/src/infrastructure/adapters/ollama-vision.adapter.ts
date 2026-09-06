import type { IVisionService } from '@ai/domain/interfaces/vision.service.interface';
import type { VisualFrameAnalysis } from '@common/ai/interfaces/visual-analysis.interface';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OllamaVisionAdapter implements IVisionService {
  constructor(private readonly config: ConfigService) {}

  async analyzeImage(input: {
    image: Uint8Array;
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  }): Promise<VisualFrameAnalysis> {
    const model =
      this.config.get<string>('AI_VISION_MODEL')?.trim() || 'qwen3.5:4b';
    const controller = new AbortController();
    const timeoutMs = this.positiveInt('AI_VISION_TIMEOUT_MS', 30_000);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    timer.unref();
    try {
      const response = await fetch(`${this.baseUrl()}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          format: {
            type: 'object',
            properties: {
              caption: { type: 'string' },
              ocrText: { type: ['string', 'null'] },
              objects: { type: 'array', items: { type: 'string' } },
            },
            required: ['caption', 'ocrText', 'objects'],
          },
          messages: [
            {
              role: 'user',
              content:
                'Describe only visible evidence in this frame. Return JSON with caption, ocrText (or null), and objects. Do not infer events, motion, identity, or content outside this frame.',
              images: [Buffer.from(input.image).toString('base64')],
            },
          ],
          options: { temperature: 0 },
        }),
        signal: controller.signal,
      });
      const raw = await response.text();
      if (!response.ok)
        throw new Error(
          `Ollama vision failed with status ${response.status}: ${raw.slice(0, 500)}`,
        );
      const payload = JSON.parse(raw) as { message?: { content?: string } };
      const content = payload.message?.content?.trim();
      if (!content) throw new Error('Ollama vision returned empty content');
      const parsed = JSON.parse(content) as unknown;
      if (!parsed || typeof parsed !== 'object')
        throw new Error('Ollama vision returned invalid JSON');
      const record = parsed as Record<string, unknown>;
      const caption =
        typeof record['caption'] === 'string' ? record['caption'].trim() : '';
      const ocrText =
        typeof record['ocrText'] === 'string'
          ? record['ocrText'].trim()
          : undefined;
      const objects = Array.isArray(record['objects'])
        ? record['objects']
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim())
            .filter(Boolean)
        : [];
      if (!caption) throw new Error('Ollama vision returned an empty caption');
      return {
        caption,
        ocrText: ocrText || undefined,
        objects,
        provider: 'self-hosted-ollama',
        model,
        version:
          this.config.get<string>('AI_VISION_VERSION')?.trim() ||
          'qwen3.5-4b-ollama-v1',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private baseUrl(): string {
    const value = this.config.get<string>('OLLAMA_BASE_URL')?.trim();
    if (!value)
      throw new Error('Missing required AI configuration: OLLAMA_BASE_URL');
    return value.replace(/\/+$/, '');
  }

  private positiveInt(key: string, fallback: number): number {
    const value = Number(this.config.get<string>(key) ?? fallback);
    return Number.isInteger(value) && value > 0
      ? Math.min(value, 120_000)
      : fallback;
  }
}
