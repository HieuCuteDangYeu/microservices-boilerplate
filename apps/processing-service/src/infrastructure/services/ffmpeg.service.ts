import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import { Injectable, Logger } from '@nestjs/common';
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

type AdaptiveVariantName = '360p' | '540p' | '720p' | '1080p';

type ReelHlsQualityProfile = 'data_saver' | 'balanced' | 'high';

type AdaptiveVariant = {
  name: AdaptiveVariantName;
  width: number;
  height: number;
  bitrateKbps: number;
  maxrateKbps: number;
  bufsizeKbps: number;
  audioBitrateKbps: number;
  minSourceLongSide: number;
};

type VideoMetadata = {
  durationMs?: number;
  width?: number;
  height?: number;
  rotation?: number;
};

const DEFAULT_HLS_SEGMENT_SECONDS = 2;
const DEFAULT_HLS_FPS = 30;
const DEFAULT_THUMBNAIL_TIMESTAMP = '00:00:02';

const QUALITY_LADDERS: Record<ReelHlsQualityProfile, AdaptiveVariant[]> = {
  data_saver: [
    {
      name: '360p',
      width: 360,
      height: 640,
      bitrateKbps: 550,
      maxrateKbps: 700,
      bufsizeKbps: 1100,
      audioBitrateKbps: 64,
      minSourceLongSide: 0,
    },
    {
      name: '540p',
      width: 540,
      height: 960,
      bitrateKbps: 1100,
      maxrateKbps: 1400,
      bufsizeKbps: 2200,
      audioBitrateKbps: 96,
      minSourceLongSide: 900,
    },
  ],
  balanced: [
    {
      name: '360p',
      width: 360,
      height: 640,
      bitrateKbps: 750,
      maxrateKbps: 950,
      bufsizeKbps: 1500,
      audioBitrateKbps: 96,
      minSourceLongSide: 0,
    },
    {
      name: '540p',
      width: 540,
      height: 960,
      bitrateKbps: 1400,
      maxrateKbps: 1800,
      bufsizeKbps: 2800,
      audioBitrateKbps: 112,
      minSourceLongSide: 900,
    },
    {
      name: '720p',
      width: 720,
      height: 1280,
      bitrateKbps: 2400,
      maxrateKbps: 3100,
      bufsizeKbps: 4800,
      audioBitrateKbps: 128,
      minSourceLongSide: 1200,
    },
  ],
  high: [
    {
      name: '360p',
      width: 360,
      height: 640,
      bitrateKbps: 850,
      maxrateKbps: 1100,
      bufsizeKbps: 1700,
      audioBitrateKbps: 96,
      minSourceLongSide: 0,
    },
    {
      name: '540p',
      width: 540,
      height: 960,
      bitrateKbps: 1600,
      maxrateKbps: 2100,
      bufsizeKbps: 3200,
      audioBitrateKbps: 128,
      minSourceLongSide: 900,
    },
    {
      name: '720p',
      width: 720,
      height: 1280,
      bitrateKbps: 2800,
      maxrateKbps: 3600,
      bufsizeKbps: 5600,
      audioBitrateKbps: 128,
      minSourceLongSide: 1200,
    },
    {
      name: '1080p',
      width: 1080,
      height: 1920,
      bitrateKbps: 4800,
      maxrateKbps: 6200,
      bufsizeKbps: 9600,
      audioBitrateKbps: 160,
      minSourceLongSide: 1800,
    },
  ],
};

const parsePositiveIntegerEnv = (
  key: string,
  fallback: number,
  min: number,
  max: number,
): number => {
  const rawValue = process.env[key];
  const parsed = Number(rawValue);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(parsed)));
};

const parseBooleanEnv = (key: string, fallback: boolean): boolean => {
  const rawValue = process.env[key]?.trim().toLowerCase();

  if (!rawValue) {
    return fallback;
  }

  if (['1', 'true', 'yes', 'on'].includes(rawValue)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(rawValue)) {
    return false;
  }

  return fallback;
};

const getQualityProfile = (): ReelHlsQualityProfile => {
  const rawValue = process.env.REEL_HLS_QUALITY_PROFILE?.trim().toLowerCase();

  if (
    rawValue === 'data_saver' ||
    rawValue === 'balanced' ||
    rawValue === 'high'
  ) {
    return rawValue;
  }

  return 'balanced';
};

const toKbps = (value: number) => `${value}k`;

const normalizeRotation = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.abs(Math.round(value)) % 360;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return Math.abs(Math.round(parsed)) % 360;
    }
  }

  return undefined;
};

const getEffectiveDimensions = (metadata: VideoMetadata) => {
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const rotation = metadata.rotation ?? 0;

  if (rotation === 90 || rotation === 270) {
    return {
      width: height,
      height: width,
    };
  }

  return {
    width,
    height,
  };
};

@Injectable()
export class FfmpegService implements IVideoProcessingService {
  private readonly logger = new Logger(FfmpegService.name);

  async transcodeToHls(inputPath: string, outputDir: string): Promise<void> {
    await this.transcodeToAdaptiveHls(inputPath, outputDir);
  }

  private getConfiguredLadder(): AdaptiveVariant[] {
    const qualityProfile = getQualityProfile();
    const include1080p = parseBooleanEnv('REEL_HLS_INCLUDE_1080P', false);
    const maxVariants = parsePositiveIntegerEnv(
      'REEL_HLS_MAX_VARIANTS',
      qualityProfile === 'high' ? 4 : 3,
      1,
      4,
    );

    let variants = QUALITY_LADDERS[qualityProfile];

    if (!include1080p) {
      variants = variants.filter((variant) => variant.name !== '1080p');
    }

    return variants.slice(0, maxVariants);
  }

  private async getEligibleAdaptiveVariants(
    inputPath: string,
  ): Promise<AdaptiveVariant[]> {
    const metadata = await this.getVideoMetadata(inputPath);
    const dimensions = getEffectiveDimensions(metadata);
    const longSide = Math.max(dimensions.width, dimensions.height);
    const configuredVariants = this.getConfiguredLadder();

    if (longSide <= 0) {
      return configuredVariants.filter((variant) => variant.name !== '1080p');
    }

    const variants = configuredVariants.filter(
      (variant) => longSide >= variant.minSourceLongSide,
    );

    return variants.length > 0 ? variants : [configuredVariants[0]];
  }

  private getHlsSegmentSeconds(): number {
    return parsePositiveIntegerEnv(
      'REEL_HLS_SEGMENT_SECONDS',
      DEFAULT_HLS_SEGMENT_SECONDS,
      1,
      6,
    );
  }

  private getOutputFps(): number {
    return parsePositiveIntegerEnv('REEL_HLS_FPS', DEFAULT_HLS_FPS, 24, 60);
  }

  private async transcodeToAdaptiveHls(
    inputPath: string,
    outputDir: string,
  ): Promise<void> {
    fs.mkdirSync(outputDir, { recursive: true });

    const variants = await this.getEligibleAdaptiveVariants(inputPath);
    const hasAudio = await this.hasAudioStream(inputPath);
    const hlsSegmentSeconds = this.getHlsSegmentSeconds();
    const outputFps = this.getOutputFps();
    const gopSize = outputFps * hlsSegmentSeconds;

    variants.forEach((_, index) => {
      fs.mkdirSync(path.join(outputDir, String(index)), { recursive: true });
    });

    this.logger.log(
      `[HLS] Preparing ${variants.length} variant(s): ${variants
        .map(
          (variant) =>
            `${variant.name}:${variant.width}x${variant.height}@${variant.bitrateKbps}k`,
        )
        .join(', ')}`,
    );

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
      process.env.REEL_HLS_X264_PRESET?.trim() || 'veryfast',
      '-pix_fmt',
      'yuv420p',
      '-r',
      String(outputFps),
      '-g',
      String(gopSize),
      '-keyint_min',
      String(gopSize),
      '-sc_threshold',
      '0',
      '-force_key_frames',
      `expr:gte(t,n_forced*${hlsSegmentSeconds})`,
    );

    variants.forEach((_, index) => {
      outputOptions.push(
        `-profile:v:${index}`,
        'main',
        `-level:v:${index}`,
        '4.0',
      );
    });

    variants.forEach((variant, index) => {
      outputOptions.push(
        `-b:v:${index}`,
        toKbps(variant.bitrateKbps),
        `-maxrate:v:${index}`,
        toKbps(variant.maxrateKbps),
        `-bufsize:v:${index}`,
        toKbps(variant.bufsizeKbps),
      );
    });

    if (hasAudio) {
      outputOptions.push('-c:a', 'aac', '-ar', '48000');

      variants.forEach((variant, index) => {
        outputOptions.push(`-b:a:${index}`, toKbps(variant.audioBitrateKbps));
      });
    }

    outputOptions.push(
      '-start_number',
      '0',
      '-hls_time',
      String(hlsSegmentSeconds),
      '-hls_playlist_type',
      'vod',
      '-hls_segment_type',
      'mpegts',
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
        .map((_, index) => (hasAudio ? `v:${index},a:${index}` : `v:${index}`))
        .join(' '),
      '-f',
      'hls',
    );

    const outputPath = path.join(outputDir, '%v', 'stream.m3u8');

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions(outputOptions)
        .output(outputPath)
        .on('start', (commandLine) => {
          this.logger.log(`[HLS] FFmpeg command: ${commandLine}`);
        })
        .on('stderr', (line) => {
          this.logger.warn(`[HLS] ${line}`);
        })
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
        .on('error', (err) =>
          reject(err instanceof Error ? err : new Error(String(err))),
        )
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
    timestamp = DEFAULT_THUMBNAIL_TIMESTAMP,
  ): Promise<void> {
    const safeTimestamp = await this.getSafeThumbnailTimestamp(
      inputPath,
      timestamp,
    );

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .seekInput(safeTimestamp)
        .frames(1)
        .outputOptions([
          '-vf',
          'scale=480:854:force_original_aspect_ratio=increase,crop=480:854,setsar=1',
          '-q:v',
          '3',
        ])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) =>
          reject(err instanceof Error ? err : new Error(String(err))),
        )
        .run();
    });
  }

  async getVideoMetadata(inputPath: string): Promise<VideoMetadata> {
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

        const videoStreamRecord =
          typeof videoStream === 'object' && videoStream !== null
            ? (videoStream as Record<string, unknown>)
            : null;

        const videoStreamTags =
          typeof videoStreamRecord?.tags === 'object' &&
          videoStreamRecord.tags !== null
            ? (videoStreamRecord.tags as Record<string, unknown>)
            : null;

        const rotation =
          normalizeRotation(videoStreamRecord?.rotation) ??
          normalizeRotation(videoStreamTags?.rotate);

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
          rotation,
        });
      });
    });
  }

  private async getSafeThumbnailTimestamp(
    inputPath: string,
    preferredTimestamp: string,
  ): Promise<string> {
    const metadata = await this.getVideoMetadata(inputPath);
    const durationMs = metadata.durationMs ?? 0;

    if (durationMs <= 0) {
      return preferredTimestamp;
    }

    if (durationMs < 2500) {
      return '00:00:00.200';
    }

    if (durationMs < 5000) {
      return '00:00:01';
    }

    return preferredTimestamp;
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
