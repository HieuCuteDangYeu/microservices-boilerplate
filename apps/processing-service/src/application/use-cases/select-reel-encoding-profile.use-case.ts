import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ReelEncodingProfile,
  ReelEncodingVariant,
  VideoMetadata,
} from '../../domain/interfaces/video-processing.service.interface';

type ReelHlsQualityProfile = 'data_saver' | 'balanced' | 'high';

const QUALITY_LADDERS: Record<ReelHlsQualityProfile, ReelEncodingVariant[]> = {
  data_saver: [
    {
      name: '360p',
      width: 360,
      height: 640,
      bitrateKbps: 550,
      maxrateKbps: 700,
      bufsizeKbps: 1100,
      audioBitrateKbps: 64,
    },
    {
      name: '540p',
      width: 540,
      height: 960,
      bitrateKbps: 1100,
      maxrateKbps: 1400,
      bufsizeKbps: 2200,
      audioBitrateKbps: 96,
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
  high: [
    {
      name: '360p',
      width: 360,
      height: 640,
      bitrateKbps: 850,
      maxrateKbps: 1100,
      bufsizeKbps: 1700,
      audioBitrateKbps: 96,
    },
    {
      name: '540p',
      width: 540,
      height: 960,
      bitrateKbps: 1600,
      maxrateKbps: 2100,
      bufsizeKbps: 3200,
      audioBitrateKbps: 128,
    },
    {
      name: '720p',
      width: 720,
      height: 1280,
      bitrateKbps: 2800,
      maxrateKbps: 3600,
      bufsizeKbps: 5600,
      audioBitrateKbps: 128,
    },
    {
      name: '1080p',
      width: 1080,
      height: 1920,
      bitrateKbps: 4800,
      maxrateKbps: 6200,
      bufsizeKbps: 9600,
      audioBitrateKbps: 160,
    },
  ],
};

@Injectable()
export class SelectReelEncodingProfileUseCase {
  constructor(private readonly configService: ConfigService) {}

  execute(metadata: VideoMetadata): ReelEncodingProfile {
    const profileName = this.getQualityProfile();
    const maxVariants = this.getPositiveInt(
      'REEL_HLS_MAX_VARIANTS',
      profileName === 'high' ? 4 : 3,
      1,
      4,
    );

    const include1080p = this.getBoolean('REEL_HLS_INCLUDE_1080P', false);
    const allow60Fps = this.getBoolean('REEL_HLS_ALLOW_60FPS', false);
    const envFps = this.getPositiveInt('REEL_HLS_FPS', 30, 24, 60);
    const segmentSeconds = this.getPositiveInt(
      'REEL_HLS_SEGMENT_SECONDS',
      2,
      1,
      6,
    );
    const maxOutputHeight = this.getPositiveInt(
      'REEL_MAX_OUTPUT_HEIGHT',
      1280,
      360,
      1920,
    );

    const sourceLongSide = this.getSourceLongSide(metadata);
    const sourceFps = metadata.fps ?? envFps;

    const outputFps =
      allow60Fps && sourceFps >= 50
        ? Math.min(60, envFps)
        : Math.min(30, envFps);

    let variants = QUALITY_LADDERS[profileName];

    if (!include1080p) {
      variants = variants.filter((variant) => variant.name !== '1080p');
    }

    variants = variants.filter((variant) => variant.height <= maxOutputHeight);

    variants = variants.filter((variant) => {
      if (sourceLongSide < 720) {
        return variant.name === '360p';
      }

      if (sourceLongSide < 960) {
        return variant.name === '360p' || variant.name === '540p';
      }

      if (sourceLongSide < 1280) {
        return variant.name === '360p' || variant.name === '540p';
      }

      if (sourceLongSide < 1800) {
        return (
          variant.name === '360p' ||
          variant.name === '540p' ||
          variant.name === '720p'
        );
      }

      return true;
    });

    variants = variants.slice(0, maxVariants);

    if (variants.length === 0) {
      variants = [QUALITY_LADDERS[profileName][0]];
    }

    return {
      profileName,
      outputFps,
      segmentSeconds,
      x264Preset:
        this.configService.get<string>('REEL_HLS_X264_PRESET')?.trim() ||
        'faster',
      variants,
    };
  }

  private getSourceLongSide(metadata: VideoMetadata): number {
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;

    if (metadata.rotation === 90 || metadata.rotation === 270) {
      return Math.max(height, width);
    }

    return Math.max(width, height);
  }

  private getQualityProfile(): ReelHlsQualityProfile {
    const value = this.configService
      .get<string>('REEL_HLS_QUALITY_PROFILE')
      ?.trim()
      .toLowerCase();

    if (value === 'data_saver' || value === 'balanced' || value === 'high') {
      return value;
    }

    return 'balanced';
  }

  private getPositiveInt(
    key: string,
    fallback: number,
    min: number,
    max: number,
  ): number {
    const parsed = Number(this.configService.get<string>(key) ?? fallback);

    if (!Number.isFinite(parsed)) {
      return fallback;
    }

    return Math.min(max, Math.max(min, Math.round(parsed)));
  }

  private getBoolean(key: string, fallback: boolean): boolean {
    const value = this.configService.get<string>(key)?.trim().toLowerCase();

    if (!value) {
      return fallback;
    }

    if (['1', 'true', 'yes', 'on'].includes(value)) {
      return true;
    }

    if (['0', 'false', 'no', 'off'].includes(value)) {
      return false;
    }

    return fallback;
  }
}
