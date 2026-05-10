import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { FeatureExtractionPipeline, pipeline } from '@xenova/transformers';
import type { IEmbeddingService } from '../../domain/interfaces/embedding.service.interface';

@Injectable()
export class XenovaEmbeddingAdapter implements IEmbeddingService, OnModuleInit {
  private readonly logger = new Logger(XenovaEmbeddingAdapter.name);
  private extractor: FeatureExtractionPipeline | null = null;

  async onModuleInit(): Promise<void> {
    try {
      this.extractor = await pipeline(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2',
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to initialize embedding model: ${msg}. AI chat will use empty context.`,
      );
    }
  }

  async generateVector(text: string): Promise<number[]> {
    if (!this.extractor) {
      throw new Error('Embedding model not initialized');
    }

    try {
      const output = await this.extractor(text, {
        pooling: 'mean',
        normalize: true,
      });

      const vector = Array.from(output.data as Float32Array);

      if (vector.length === 0) {
        throw new Error('Embedding model returned empty vector');
      }

      return vector;
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error(`generateVector failed: ${error.message}`);
        throw error;
      }
      throw new Error('Unknown embedding generation error');
    }
  }
}
