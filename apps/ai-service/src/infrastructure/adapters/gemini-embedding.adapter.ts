import { GenerateEmbeddingRequest } from '@common/ai/interfaces/generate-embedding.interface';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IEmbeddingService } from '../../domain/interfaces/embedding.service.interface';

interface GeminiEmbedResponse {
  embedding?: {
    values?: number[];
  };
  error?: {
    message?: string;
  };
}

@Injectable()
export class GeminiEmbeddingAdapter implements IEmbeddingService {
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly outputDimensionality: number;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.getOrThrow<string>('GEMINI_API_KEY');
    const configuredModel =
      this.configService.get<string>('GEMINI_EMBEDDING_MODEL') ||
      'models/gemini-embedding-001';
    const model = configuredModel.startsWith('models/')
      ? configuredModel
      : `models/${configuredModel}`;
    this.endpoint = `https://generativelanguage.googleapis.com/v1beta/${model}:embedContent`;

    const configuredDimensions = Number(
      this.configService.get<string>('GEMINI_EMBEDDING_DIMENSIONS') ?? '384',
    );
    this.outputDimensionality =
      Number.isFinite(configuredDimensions) && configuredDimensions > 0
        ? Math.round(configuredDimensions)
        : 384;
  }

  async generateVector(input: GenerateEmbeddingRequest): Promise<number[]> {
    const text = input.text.trim();

    if (text.length === 0) {
      throw new Error('Embedding input text cannot be empty');
    }

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.apiKey,
      },
      body: JSON.stringify({
        content: {
          parts: [{ text }],
        },
        taskType: input.taskType,
        title:
          input.taskType === 'RETRIEVAL_DOCUMENT' && input.title
            ? input.title.trim()
            : undefined,
        outputDimensionality: this.outputDimensionality,
      }),
    });

    const rawBody = await response.text();
    const payload = this.parseResponse(rawBody);

    if (!response.ok) {
      throw new Error(this.extractErrorMessage(payload, rawBody));
    }

    const vector = payload.embedding?.values;
    if (!Array.isArray(vector) || vector.length === 0) {
      throw new Error('Gemini embedding request returned an empty vector');
    }

    return this.outputDimensionality === 3072
      ? vector
      : this.normalizeVector(vector);
  }

  private normalizeVector(vector: number[]): number[] {
    const magnitude = Math.sqrt(
      vector.reduce((sum, value) => sum + value * value, 0),
    );

    if (!Number.isFinite(magnitude) || magnitude === 0) {
      throw new Error('Gemini embedding vector has invalid magnitude');
    }

    return vector.map((value) => value / magnitude);
  }

  private parseResponse(rawBody: string): GeminiEmbedResponse {
    try {
      return JSON.parse(rawBody) as GeminiEmbedResponse;
    } catch {
      return {};
    }
  }

  private extractErrorMessage(
    payload: GeminiEmbedResponse,
    rawBody: string,
  ): string {
    if (payload.error?.message) {
      return payload.error.message;
    }

    if (rawBody.trim().length > 0) {
      return rawBody;
    }

    return 'Unknown Gemini embedding error';
  }
}
