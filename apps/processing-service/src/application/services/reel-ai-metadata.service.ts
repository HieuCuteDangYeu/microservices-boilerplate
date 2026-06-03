import { TranscriptionResult } from '@common/ai/interfaces/transcription-result.interface';
import { ReelChunkIndexInput } from '@common/content/interfaces/reel-chunk-index.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import type { IAiService } from '../../domain/interfaces/ai-service.interface';
import type { IVideoProcessingService } from '../../domain/interfaces/video-processing.service.interface';
import { formatProcessingError } from './processing-error-formatter.service';
import { ReelChunkBuilderService } from './reel-chunk-builder.service';
import { buildReelTranscriptionPrompt } from './reel-transcription-prompt.builder';

@Injectable()
export class ReelAiMetadataService {
  private readonly logger = new Logger(ReelAiMetadataService.name);

  constructor(
    @Inject('IAiService')
    private readonly aiService: IAiService,
    @Inject('IVideoProcessingService')
    private readonly videoProcessingService: IVideoProcessingService,
    private readonly reelChunkBuilder: ReelChunkBuilderService,
  ) {}

  async build(data: {
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

      const audioBuffer = fs.readFileSync(data.audioPath);

      if (fs.existsSync(data.audioPath)) {
        fs.unlinkSync(data.audioPath);
      }

      transcription = await this.aiService.transcribeAudio(audioBuffer, {
        initialPrompt: buildReelTranscriptionPrompt(data),
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
      if (fs.existsSync(data.audioPath)) {
        fs.unlinkSync(data.audioPath);
      }
    }

    const transcript = transcription?.text?.trim() || undefined;
    const transcriptVtt = transcription?.vtt?.trim() || undefined;

    const transcriptSegments =
      transcription?.segments && transcription.segments.length > 0
        ? transcription.segments
        : undefined;

    const chunks = await this.reelChunkBuilder.buildSearchableChunks({
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
