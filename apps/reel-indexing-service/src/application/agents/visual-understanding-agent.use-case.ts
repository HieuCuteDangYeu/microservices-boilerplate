import { AnalyzeVisualFrameManifestUseCase } from '@indexing/application/use-cases/analyze-visual-frame-manifest.use-case';
import type { IIndexingAiService } from '@indexing/domain/interfaces/ai-service.interface';
import type { IArtifactStorage } from '@indexing/domain/interfaces/artifact-storage.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class VisualUnderstandingAgentUseCase extends AnalyzeVisualFrameManifestUseCase {
  private readonly agentLogger = new Logger(VisualUnderstandingAgentUseCase.name);

  constructor(
    config: ConfigService,
    @Inject('IArtifactStorage') storage: IArtifactStorage,
    @Inject('IIndexingAiService') ai: IIndexingAiService,
  ) {
    super(config, storage, ai);
  }

  override async execute(...args: Parameters<AnalyzeVisualFrameManifestUseCase['execute']>) {
    const scenes = await super.execute(...args);
    this.agentLogger.debug(
      `[VisualUnderstandingAgent] reelId=${args[0].reelId} groundedScenes=${scenes.length}`,
    );
    return scenes;
  }
}
