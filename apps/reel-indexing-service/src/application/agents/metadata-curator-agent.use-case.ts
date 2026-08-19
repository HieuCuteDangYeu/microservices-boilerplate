import { ExtractHierarchicalMetadataUseCase } from '@indexing/application/use-cases/extract-hierarchical-metadata.use-case';
import type { IIndexingAiService } from '@indexing/domain/interfaces/ai-service.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MetadataCuratorAgentUseCase extends ExtractHierarchicalMetadataUseCase {
  private readonly agentLogger = new Logger(MetadataCuratorAgentUseCase.name);

  constructor(@Inject('IIndexingAiService') ai: IIndexingAiService) {
    super(ai);
  }

  override async execute(...args: Parameters<ExtractHierarchicalMetadataUseCase['execute']>) {
    const result = await super.execute(...args);
    this.agentLogger.debug(
      `[MetadataCuratorAgent] reelId=${args[0].reelId} tags=${result.metadata.tags.length} sections=${result.sections.length}`,
    );
    return result;
  }
}
