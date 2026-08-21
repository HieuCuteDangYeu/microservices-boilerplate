import type { TranscriptMatch } from '@ai/domain/interfaces/content-service.interface';
import type { RagRetrievalPlan } from '@ai/domain/interfaces/rag-chat-workflow.interface';
import type { IRetrievalEngine } from '@ai/domain/interfaces/retrieval-engine.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class RerankRetrievedEvidenceUseCase {
  constructor(
    @Inject('IRetrievalEngine')
    private readonly retrievalEngine: IRetrievalEngine,
  ) {}

  async execute(input: {
    plan: RagRetrievalPlan;
    retrievedChunks: TranscriptMatch[];
  }): Promise<TranscriptMatch[]> {
    return await this.retrievalEngine.rerank(input);
  }
}
