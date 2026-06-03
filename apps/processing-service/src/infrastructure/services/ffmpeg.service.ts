import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import { Injectable } from '@nestjs/common';
import type { IVideoProcessingService } from '@processing/domain/interfaces/video-processing.service.interface';
import ffmpeg from 'fluent-ffmpeg';
import * as fs from 'fs';
import * as path from 'path';

const canExecute = (binaryPath: string) => {
  try {
    fs.accessSync(binaryPath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

const findBinaryOnPath = (binaryName: string) => {
  const executableName =
    process.platform === 'win32' ? `${binaryName}.exe` : binaryName;
  const pathValue = process.env.PATH;

  if (!pathValue) {
    return undefined;
  }

  for (const directory of pathValue.split(path.delimiter)) {
    const candidatePath = path.join(directory, executableName);

    if (canExecute(candidatePath)) {
      return candidatePath;
    }
  }

  return undefined;
};

const resolveBinaryPath = (
  binaryName: 'ffmpeg' | 'ffprobe',
  packagedPath: string,
) => {
  const overrideEnvVar =
    binaryName === 'ffmpeg' ? 'FFMPEG_PATH' : 'FFPROBE_PATH';
  const configuredPath = process.env[overrideEnvVar];

  if (configuredPath && canExecute(configuredPath)) {
    return configuredPath;
  }

  if (canExecute(packagedPath)) {
    return packagedPath;
  }

  const systemPath = findBinaryOnPath(binaryName);

  if (systemPath) {
    return systemPath;
  }

  throw new Error(
    `${binaryName} binary is not executable. Set ${overrideEnvVar} or install ${binaryName} in the runtime image.`,
  );
};

const ffmpegPath = resolveBinaryPath('ffmpeg', ffmpegInstaller.path);
const ffprobePath = resolveBinaryPath('ffprobe', ffprobeInstaller.path);

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

@Injectable()
export class FfmpegService implements IVideoProcessingService {
  async transcodeToHls(inputPath: string, outputDir: string): Promise<void> {
    fs.mkdirSync(outputDir, { recursive: true });

    const outputPath = `${outputDir}/stream.m3u8`;

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions([
          '-profile:v baseline',
          '-level 3.0',
          '-start_number 0',
          '-hls_time 10',
          '-hls_list_size 0',
          '-f hls',
        ])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) =>
          reject(err instanceof Error ? err : new Error(String(err))),
        )
        .run();
    });
  }

  async extractAudio(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .noVideo()
        .audioFrequency(16000)
        .audioChannels(1)
        .format('wav')
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });
  }

  async extractAudioForTranscription(
    inputPath: string,
    outputPath: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .noVideo()
        .audioChannels(1)
        .audioFrequency(16000)
        .audioCodec('pcm_s16le')
        .audioFilters(['highpass=f=80', 'lowpass=f=8000', 'loudnorm'])
        .format('wav')
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) =>
          reject(err instanceof Error ? err : new Error(String(err))),
        )
        .run();
    });
  }

  async extractThumbnail(
    inputPath: string,
    outputPath: string,
    timestamp = '00:00:02',
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .seekInput(timestamp)
        .frames(1)
        .size('480x?')
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) =>
          reject(err instanceof Error ? err : new Error(String(err))),
        )
        .run();
    });
  }

  async getVideoMetadata(inputPath: string): Promise<{
    durationMs?: number;
    width?: number;
    height?: number;
  }> {
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
