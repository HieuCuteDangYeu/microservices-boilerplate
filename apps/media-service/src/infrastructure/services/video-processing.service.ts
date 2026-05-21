import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import { Injectable } from '@nestjs/common';
import { chmodSync, statSync } from 'fs';
import ffmpeg from 'fluent-ffmpeg';

const ensureBinaryIsExecutable = (binaryPath: string) => {
  const currentMode = statSync(binaryPath).mode & 0o777;

  if ((currentMode & 0o111) === 0o111) {
    return;
  }

  chmodSync(binaryPath, currentMode | 0o755);
};

ensureBinaryIsExecutable(ffmpegInstaller.path);
ensureBinaryIsExecutable(ffprobeInstaller.path);

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

interface VideoMetadata {
  durationMs?: number;
  width?: number;
  height?: number;
}

@Injectable()
export class VideoProcessingService {
  async extractThumbnail(
    inputPath: string,
    outputPath: string,
    timestamp = '00:00:00.500',
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .seekInput(timestamp)
        .frames(1)
        .size('640x?')
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) =>
          reject(err instanceof Error ? err : new Error(String(err))),
        )
        .run();
    });
  }

  async getMetadata(inputPath: string): Promise<VideoMetadata> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (error, metadata) => {
        if (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
          return;
        }

        const videoStream = metadata.streams.find(
          (stream) => stream.codec_type === 'video',
        );

        const durationSeconds =
          typeof metadata.format?.duration === 'number'
            ? metadata.format.duration
            : undefined;

        resolve({
          durationMs:
            durationSeconds !== undefined
              ? Math.max(0, Math.round(durationSeconds * 1000))
              : undefined,
          width:
            typeof videoStream?.width === 'number'
              ? videoStream.width
              : undefined,
          height:
            typeof videoStream?.height === 'number'
              ? videoStream.height
              : undefined,
        });
      });
    });
  }
}
