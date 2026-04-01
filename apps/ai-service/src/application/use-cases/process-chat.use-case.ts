import { Inject, Injectable } from '@nestjs/common';
import type { IEmbeddingService } from '../../domain/interfaces/embedding.service.interface';
import type { IKnowledgeRepository } from '../../domain/interfaces/knowledge.repository.interface';
import type { ILlmService } from '../../domain/interfaces/llm.service.interface';

@Injectable()
export class ProcessChatUseCase {
  constructor(
    @Inject('IKnowledgeRepository')
    private readonly knowledgeRepository: IKnowledgeRepository,
    @Inject('IEmbeddingService')
    private readonly embeddingService: IEmbeddingService,
    @Inject('ILlmService') private readonly llmService: ILlmService,
  ) {}

  async execute(userMessage: string, userId: string): Promise<string> {
    const queryVector = await this.embeddingService.generateVector(userMessage);
    const rules = await this.knowledgeRepository.search(queryVector, 3);

    const context = rules
      .map((r) => `Rule: ${r.topic}\nDetails: ${r.content}`)
      .join('\n\n');

    return await this.llmService.generateResponse(userMessage, context, userId);
  }
}
