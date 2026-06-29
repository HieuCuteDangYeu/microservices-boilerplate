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

  const systemPath = findBinaryOnPath(binaryName);

  if (systemPath) {
    return systemPath;
  }

  if (canExecute(packagedPath)) {
    return packagedPath;
  }

  throw new Error(
    `${binaryName} binary is not executable. Set ${overrideEnvVar} or install ${binaryName} in the runtime image.`,
  );
};

const ffmpegPath = resolveBinaryPath('ffmpeg', ffmpegInstaller.path);
const ffprobePath = resolveBinaryPath('ffprobe', ffprobeInstaller.path);

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

type AdaptiveVariant = {
  name: '360p' | '540p' | '720p' | '1080p';
  width: number;
  height: number;
  bitrate: string;
  maxrate: string;
  bufsize: string;
  audioBitrate: string;
  minSourceLongSide: number;
};

const ADAPTIVE_VARIANTS: AdaptiveVariant[] = [
  {
    name: '360p',
    width: 360,
    height: 640,
    bitrate: '800k',
    maxrate: '1000k',
    bufsize: '1600k',
    audioBitrate: '96k',
    minSourceLongSide: 0,
  },
  {
    name: '540p',
    width: 540,
    height: 960,
    bitrate: '1600k',
    maxrate: '2000k',
    bufsize: '3200k',
    audioBitrate: '128k',
    minSourceLongSide: 900,
  },
  {
    name: '720p',
    width: 720,
    height: 1280,
    bitrate: '2800k',
    maxrate: '3500k',
    bufsize: '5600k',
    audioBitrate: '128k',
    minSourceLongSide: 1200,
  },
  {
    name: '1080p',
    width: 1080,
    height: 1920,
    bitrate: '5000k',
    maxrate: '6500k',
    bufsize: '10000k',
    audioBitrate: '128k',
    minSourceLongSide: 1800,
  },
];

@Injectable()
export class FfmpegService implements IVideoProcessingService {
  async transcodeToHls(inputPath: string, outputDir: string): Promise<void> {
    await this.transcodeToAdaptiveHls(inputPath, outputDir);
  }

  private async getEligibleAdaptiveVariants(
    inputPath: string,
  ): Promise<AdaptiveVariant[]> {
    const metadata = await this.getVideoMetadata(inputPath);
    const longSide = Math.max(metadata.width ?? 0, metadata.height ?? 0);

    if (longSide <= 0) {
      return ADAPTIVE_VARIANTS.filter((variant) => variant.name !== '1080p');
    }

    const variants = ADAPTIVE_VARIANTS.filter(
      (variant) => longSide >= variant.minSourceLongSide,
    );

    return variants.length > 0 ? variants : [ADAPTIVE_VARIANTS[0]];
  }

  private async transcodeToAdaptiveHls(
    inputPath: string,
    outputDir: string,
  ): Promise<void> {
    fs.mkdirSync(outputDir, { recursive: true });

    const variants = await this.getEligibleAdaptiveVariants(inputPath);

    for (const variant of variants) {
      fs.mkdirSync(path.join(outputDir, variant.name), { recursive: true });
    }

    const hasAudio = await this.hasAudioStream(inputPath);

    const filterComplex = [
      `[0:v]split=${variants.length}${variants
        .map((_, index) => `[v${index}src]`)
        .join('')}`,
      ...variants.map(
        (variant, index) =>
          `[v${index}src]scale=${variant.width}:${variant.height}:force_original_aspect_ratio=increase,crop=${variant.width}:${variant.height},setsar=1[v${index}]`,
      ),
    ].join(';');

    const outputOptions: string[] = ['-filter_complex', filterComplex];

    variants.forEach((_, index) => {
      outputOptions.push('-map', `[v${index}]`);

      if (hasAudio) {
        outputOptions.push('-map', '0:a:0');
      }
    });

    outputOptions.push(
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-profile:v',
      'main',
      '-level',
      '4.0',
      '-pix_fmt',
      'yuv420p',
      '-r',
      '30',
      '-g',
      '60',
      '-keyint_min',
      '60',
      '-sc_threshold',
      '0',
      '-force_key_frames',
      'expr:gte(t,n_forced*2)',
    );

    variants.forEach((variant, index) => {
      outputOptions.push(
        `-b:v:${index}`,
        variant.bitrate,
        `-maxrate:v:${index}`,
        variant.maxrate,
        `-bufsize:v:${index}`,
        variant.bufsize,
      );
    });

    if (hasAudio) {
      outputOptions.push('-c:a', 'aac', '-ar', '48000');

      variants.forEach((variant, index) => {
        outputOptions.push(`-b:a:${index}`, variant.audioBitrate);
      });
    }

    outputOptions.push(
      '-start_number',
      '0',
      '-hls_time',
      '2',
      '-hls_playlist_type',
      'vod',
      '-hls_flags',
      'independent_segments',
      '-hls_list_size',
      '0',
      '-hls_segment_filename',
      path.join(outputDir, '%v', 'segment_%03d.ts'),
      '-master_pl_name',
      'master.m3u8',
      '-var_stream_map',
      variants
        .map((variant, index) =>
          hasAudio
            ? `v:${index},a:${index},name:${variant.name}`
            : `v:${index},name:${variant.name}`,
        )
        .join(' '),
      '-f',
      'hls',
    );

    const outputPath = path.join(outputDir, '%v', 'stream.m3u8');

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions(outputOptions)
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

  private async hasAudioStream(inputPath: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (error, metadata) => {
        if (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
          return;
        }

        resolve(
          metadata.streams.some((stream) => stream.codec_type === 'audio'),
        );
      });
    });
  }
}
