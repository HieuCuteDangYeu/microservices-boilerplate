import type { ReelIndexDocument } from '@common/processing/interfaces/reel-index-document.interface';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ValidateEmbeddingQualityUseCase {
  execute(input: {
    documents: ReelIndexDocument[];
    expectedDimensions?: number;
    maxDuplicateRatio?: number;
  }): void {
    if (input.documents.length === 0) {
      throw new Error('Semantic candidate has no embedded documents');
    }

    const signatures = new Set<string>();

    for (const document of input.documents) {
      const expected = input.expectedDimensions ?? document.embeddingDimensions;
      if (
        !Number.isInteger(expected) ||
        expected <= 0 ||
        document.embeddingDimensions !== expected ||
        document.embedding.length !== expected
      ) {
        throw new Error(
          `Embedding dimension mismatch for ${document.kind}:${document.id}; expected=${expected} declared=${document.embeddingDimensions} actual=${document.embedding.length}`,
        );
      }

      let squaredNorm = 0;
      for (const value of document.embedding) {
        if (!Number.isFinite(value)) {
          throw new Error(
            `Embedding for ${document.kind}:${document.id} contains a non-finite value`,
          );
        }
        squaredNorm += value * value;
      }

      if (!Number.isFinite(squaredNorm) || squaredNorm <= 1e-12) {
        throw new Error(
          `Embedding for ${document.kind}:${document.id} has a zero or invalid norm`,
        );
      }

      signatures.add(this.signature(document.embedding));
    }

    if (input.documents.length >= 6) {
      const duplicateRatio =
        (input.documents.length - signatures.size) / input.documents.length;
      const maximum = Math.min(1, Math.max(0, input.maxDuplicateRatio ?? 0.5));
      if (duplicateRatio > maximum) {
        throw new Error(
          `Embedding duplicate ratio ${duplicateRatio.toFixed(3)} exceeds ${maximum.toFixed(3)}`,
        );
      }
    }
  }

  private signature(values: number[]): string {
    return values.map((value) => value.toPrecision(10)).join(',');
  }
}
