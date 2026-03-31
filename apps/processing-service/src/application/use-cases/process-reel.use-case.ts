import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { FfmpegService } from '../../infrastructure/services/ffmpeg.service';
import { R2Service } from '../../infrastructure/services/r2.service';

@Injectable()
export class ProcessReelUseCase {
  constructor(
    private readonly r2Service: R2Service,
    private readonly ffmpegService: FfmpegService,
    @Inject('CONTENT_RMQ') private readonly messageBroker: ClientProxy,
  ) {}

  async execute(data: { reelId: string; mediaKey: string; userId: string }) {
    const { reelId, mediaKey } = data;

    const workDir = path.join('/tmp', crypto.randomUUID());
    const inputPath = path.join(workDir, 'input.mp4');
    const hlsOutputDir = path.join(workDir, 'hls');

    try {
      await this.r2Service.downloadVideo(mediaKey, inputPath);

      await this.ffmpegService.transcodeToHls(inputPath, hlsOutputDir);

      const s3Prefix = mediaKey.replace('.mp4', '');
      await this.r2Service.uploadHlsDirectory(hlsOutputDir, s3Prefix);

      this.messageBroker.emit('reel.processing_completed', {
        reelId,
        status: 'COMPLETED',
      });
    } catch (error) {
      console.error(`[Reel ${reelId}] Processing failed:`, error);

      this.messageBroker.emit('reel.processing_failed', {
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
