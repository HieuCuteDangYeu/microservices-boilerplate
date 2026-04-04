import { Inject, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { IAiService } from '../../domain/interfaces/ai-service.interface';
import type { IContentService } from '../../domain/interfaces/content-service.interface';
import { FfmpegService } from '../../infrastructure/services/ffmpeg.service';
import { R2Service } from '../../infrastructure/services/r2.service';

@Injectable()
export class ProcessReelUseCase {
  constructor(
    private readonly r2Service: R2Service,
    private readonly ffmpegService: FfmpegService,
    @Inject('IAiService') private readonly aiService: IAiService,
    @Inject('IContentService') private readonly contentService: IContentService,
  ) {}

  async execute(data: { reelId: string; mediaKey: string; userId: string }) {
    const { reelId, mediaKey } = data;

    const workDir = path.join('/tmp', crypto.randomUUID());
    const inputPath = path.join(workDir, 'input.mp4');
    const hlsOutputDir = path.join(workDir, 'hls');
    const audioPath = path.join(workDir, 'audio.wav');

    try {
      await this.r2Service.downloadVideo(mediaKey, inputPath);

      await this.ffmpegService.transcodeToHls(inputPath, hlsOutputDir);

      const s3Prefix = mediaKey.replace('.mp4', '');
      await this.r2Service.uploadHlsDirectory(hlsOutputDir, s3Prefix);

      await this.ffmpegService.extractAudio(inputPath, audioPath);

      const audioBuffer = fs.readFileSync(audioPath);

      const transcriptText = await this.aiService.transcribeAudio(audioBuffer);

      const embedding = await this.aiService.generateEmbedding(transcriptText);

      this.contentService.emitProcessingCompleted({
        reelId,
        status: 'COMPLETED',
        transcript: transcriptText,
        embedding: embedding,
      });
    } catch (error) {
      console.error(`[Reel ${reelId}] Processing failed:`, error);

      this.contentService.emitProcessingFailed({
        reelId,
        status: 'FAILED',
      });
    } finally {
      if (fs.existsSync(workDir)) {
        fs.rmSync(workDir, { recursive: true, force: true });
      }
    }
  }
}
