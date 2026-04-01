import { Injectable, OnModuleInit } from '@nestjs/common';
import { FeatureExtractionPipeline, pipeline } from '@xenova/transformers';
import type { IEmbeddingService } from '../../domain/interfaces/embedding.service.interface';

@Injectable()
export class XenovaEmbeddingAdapter implements IEmbeddingService, OnModuleInit {
  private extractor: FeatureExtractionPipeline | null = null;

  async onModuleInit(): Promise<void> {
    this.extractor = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2',
    );
  }

  async generateVector(text: string): Promise<number[]> {
    if (!this.extractor) {
      throw new Error('Embedding model has not been initialized');
    }

    const output = await this.extractor(text, {
      pooling: 'mean',
      normalize: true,
    });

    return Array.from(output.data as Float32Array);
  }
}
