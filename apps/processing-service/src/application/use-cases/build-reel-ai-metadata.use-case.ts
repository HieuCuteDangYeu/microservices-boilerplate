import { TranscriptionResult } from '@common/ai/interfaces/transcription-result.interface';
import { ReelChunkIndexInput } from '@common/content/interfaces/reel-chunk-index.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { IAiService } from '../../domain/interfaces/ai-service.interface';
import type { ITempFileService } from '../../domain/interfaces/temp-file.service.interface';
import type { IVideoProcessingService } from '../../domain/interfaces/video-processing.service.interface';
import { formatProcessingError } from '../utils/format-processing-error';
import { BuildReelSearchIndexUseCase } from './build-reel-search-index.use-case';
import { BuildReelTranscriptionPromptUseCase } from './build-reel-transcription-prompt.use-case';

@Injectable()
export class BuildReelAiMetadataUseCase {
  private readonly logger = new Logger(BuildReelAiMetadataUseCase.name);

  constructor(
    @Inject('IAiService')
    private readonly aiService: IAiService,
    @Inject('IVideoProcessingService')
    private readonly videoProcessingService: IVideoProcessingService,
    @Inject('ITempFileService')
    private readonly tempFileService: ITempFileService,
    private readonly buildReelSearchIndexUseCase: BuildReelSearchIndexUseCase,
    private readonly buildReelTranscriptionPromptUseCase: BuildReelTranscriptionPromptUseCase,
  ) {}

  async execute(data: {
    reelId: string;
    title?: string;
    description?: string;
    tags?: string[];
    inputPath: string;
    audioPath: string;
  }): Promise<{
    transcript?: string;
    transcriptVtt?: string;
    transcriptSegments?: TranscriptionResult['segments'];
    chunks?: ReelChunkIndexInput[];
  }> {
    let transcription: TranscriptionResult | undefined;

    try {
      await this.videoProcessingService.extractAudioForTranscription(
        data.inputPath,
        data.audioPath,
      );

      const audioBuffer = this.tempFileService.readFile(data.audioPath);

      this.tempFileService.removeFileIfExists(data.audioPath);

      transcription = await this.aiService.transcribeAudio(audioBuffer, {
        initialPrompt: this.buildReelTranscriptionPromptUseCase.execute(data),
      });

      this.logger.log(
        `[Reel ${data.reelId}] Audio transcription completed: chars=${transcription.text?.length ?? 0}, segments=${transcription.segments?.length ?? 0}`,
      );
    } catch (error: unknown) {
      const { message, stack } = formatProcessingError(error);

      this.logger.warn(
        `[Reel ${data.reelId}] Audio transcription failed, continuing with metadata-only indexing if available: ${message}`,
        stack,
      );
    } finally {
      this.tempFileService.removeFileIfExists(data.audioPath);
    }

    const transcript = transcription?.text?.trim() || undefined;
    const transcriptVtt = transcription?.vtt?.trim() || undefined;

    const transcriptSegments =
      transcription?.segments && transcription.segments.length > 0
        ? transcription.segments
        : undefined;

    const chunks = await this.buildReelSearchIndexUseCase.execute({
      reelId: data.reelId,
      title: data.title,
      description: data.description,
      tags: data.tags,
      transcript,
      transcriptSegments,
    });

    return {
      transcript,
      transcriptVtt,
      transcriptSegments,
      chunks: chunks.length > 0 ? chunks : undefined,
    };
  }
}
