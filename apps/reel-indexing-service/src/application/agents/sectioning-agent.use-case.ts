import { BuildAdaptiveTranscriptSectionsUseCase } from '@indexing/application/use-cases/build-adaptive-transcript-sections.use-case';
import { BuildTranscriptSectionsUseCase } from '@indexing/application/use-cases/build-transcript-sections.use-case';
import type { IIndexingAiService } from '@indexing/domain/interfaces/ai-service.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SectioningAgentUseCase extends BuildAdaptiveTranscriptSectionsUseCase {
  private readonly agentLogger = new Logger(SectioningAgentUseCase.name);

  constructor(
    config: ConfigService,
    legacy: BuildTranscriptSectionsUseCase,
    @Inject('IIndexingAiService') ai: IIndexingAiService,
  ) {
    super(config, legacy, ai);
  }

  override async execute(...args: Parameters<BuildAdaptiveTranscriptSectionsUseCase['execute']>) {
    const sections = await super.execute(...args);
    this.agentLogger.debug(
      `[SectioningAgent] segments=${args[0].length} sections=${sections.length}`,
    );
    return sections;
  }
}
