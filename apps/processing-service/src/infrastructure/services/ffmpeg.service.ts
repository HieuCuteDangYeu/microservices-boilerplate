import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import { Injectable, Logger } from '@nestjs/common';
import type {
  IVideoProcessingService,
  ReelEncodingProfile,
  ReelEncodingVariant,
  TranscodeToHlsResult,
  VideoMetadata,
} from '@processing/domain/interfaces/video-processing.service.interface';
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

const DEFAULT_PROFILE: ReelEncodingProfile = {
  profileName: 'balanced',
  outputFps: 30,
  segmentSeconds: 2,
  x264Preset: 'faster',
  variants: [
    {
      name: '360p',
      width: 360,
      height: 640,
      bitrateKbps: 750,
      maxrateKbps: 950,
      bufsizeKbps: 1500,
      audioBitrateKbps: 96,
    },
    {
      name: '540p',
      width: 540,
      height: 960,
      bitrateKbps: 1400,
      maxrateKbps: 1800,
      bufsizeKbps: 2800,
      audioBitrateKbps: 112,
    },
    {
      name: '720p',
      width: 720,
      height: 1280,
      bitrateKbps: 2400,
      maxrateKbps: 3100,
      bufsizeKbps: 4800,
      audioBitrateKbps: 128,
    },
  ],
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

const parseBitrateKbps = (value: unknown): number | undefined => {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return Math.round(parsed / 1000);
};

const parseFrameRate = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Number(value.toFixed(3));
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  if (!value.includes('/')) {
    const parsed = Number(value);

    return Number.isFinite(parsed) && parsed > 0
      ? Number(parsed.toFixed(3))
      : undefined;
  }

  const [numeratorRaw, denominatorRaw] = value.split('/');
  const numerator = Number(numeratorRaw);
  const denominator = Number(denominatorRaw);

  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator <= 0
  ) {
    return undefined;
  }

  const fps = numerator / denominator;

  return fps > 0 ? Number(fps.toFixed(3)) : undefined;
};

@Injectable()
export class FfmpegService implements IVideoProcessingService {
  private readonly logger = new Logger(FfmpegService.name);

  async transcodeToHls(
    inputPath: string,
    outputDir: string,
    profile: ReelEncodingProfile = DEFAULT_PROFILE,
  ): Promise<TranscodeToHlsResult> {
    await this.transcodeToAdaptiveHls(inputPath, outputDir, profile);

    return {
      variantCount: profile.variants.length,
      maxHeight: Math.max(...profile.variants.map((variant) => variant.height)),
      outputFps: profile.outputFps,
      segmentSeconds: profile.segmentSeconds,
      variantNames: profile.variants.map((variant) => variant.name),
    };
  }

  private async transcodeToAdaptiveHls(
    inputPath: string,
    outputDir: string,
    profile: ReelEncodingProfile,
  ): Promise<void> {
    fs.mkdirSync(outputDir, { recursive: true });

    const variants = profile.variants;
    const hasAudio = await this.hasAudioStream(inputPath);
    const gopSize = profile.outputFps * profile.segmentSeconds;

    variants.forEach((_, index) => {
      fs.mkdirSync(path.join(outputDir, String(index)), { recursive: true });
    });

    this.logger.log(
      `[HLS] Encoding profile=${profile.profileName}, fps=${profile.outputFps}, segment=${profile.segmentSeconds}s, variants=${variants
        .map(
          (variant) =>
            `${variant.name}:${variant.width}x${variant.height}@${variant.bitrateKbps}k`,
        )
        .join(', ')}`,
    );

    const filterComplex = this.buildFilterComplex(variants);
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
      profile.x264Preset,
      '-pix_fmt',
      'yuv420p',
      '-r',
      String(profile.outputFps),
      '-g',
      String(gopSize),
      '-keyint_min',
      String(gopSize),
      '-sc_threshold',
      '0',
      '-force_key_frames',
      `expr:gte(t,n_forced*${profile.segmentSeconds})`,
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
      String(profile.segmentSeconds),
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

  private buildFilterComplex(variants: ReelEncodingVariant[]): string {
    return [
      `[0:v]split=${variants.length}${variants
        .map((_, index) => `[v${index}src]`)
        .join('')}`,
      ...variants.map(
        (variant, index) =>
          `[v${index}src]scale=${variant.width}:${variant.height}:force_original_aspect_ratio=increase,crop=${variant.width}:${variant.height},setsar=1[v${index}]`,
      ),
    ].join(';');
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
    timestamp = '00:00:02',
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

        const hasAudio = metadata.streams.some(
          (stream) => stream.codec_type === 'audio',
        );

        const videoRecord =
          typeof videoStream === 'object' && videoStream !== null
            ? (videoStream as Record<string, unknown>)
            : null;

        const videoTags =
          typeof videoRecord?.tags === 'object' && videoRecord.tags !== null
            ? (videoRecord.tags as Record<string, unknown>)
            : null;

        const formatRecord =
          typeof metadata.format === 'object' && metadata.format !== null
            ? (metadata.format as Record<string, unknown>)
            : null;

        const durationSeconds =
          typeof formatRecord?.duration === 'number'
            ? formatRecord.duration
            : typeof formatRecord?.duration === 'string'
              ? Number(formatRecord.duration)
              : undefined;

        const rotation =
          normalizeRotation(videoRecord?.rotation) ??
          normalizeRotation(videoTags?.rotate);

        const fps =
          parseFrameRate(videoRecord?.avg_frame_rate) ??
          parseFrameRate(videoRecord?.r_frame_rate);

        const bitrateKbps =
          parseBitrateKbps(videoRecord?.bit_rate) ??
          parseBitrateKbps(formatRecord?.bit_rate);

        resolve({
          durationMs:
            durationSeconds !== undefined && Number.isFinite(durationSeconds)
              ? Math.max(0, Math.round(durationSeconds * 1000))
              : undefined,
          width:
            typeof videoRecord?.width === 'number'
              ? videoRecord.width
              : undefined,
          height:
            typeof videoRecord?.height === 'number'
              ? videoRecord.height
              : undefined,
          fps,
          bitrateKbps,
          hasAudio,
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
    const metadata = await this.getVideoMetadata(inputPath);
    return metadata.hasAudio === true;
  }
}
