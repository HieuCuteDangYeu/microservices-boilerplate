import type {
  ReelPipelineMediaClass,
  ReelPipelineOrientation,
} from '@common/processing/interfaces/reel-pipeline-metric.interface';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { VideoMetadata } from '@processing/domain/interfaces/video-processing.service.interface';

export interface ReelMediaClassification {
  orientation: ReelPipelineOrientation;
  mediaClass: ReelPipelineMediaClass;
  effectiveWidth?: number;
  effectiveHeight?: number;
  aspectRatio?: number;
}

@Injectable()
export class ClassifyReelMediaUseCase {
  constructor(private readonly configService: ConfigService) {}

  execute(metadata: VideoMetadata): ReelMediaClassification {
    const dimensions = this.getEffectiveDimensions(metadata);
    const durationMs = metadata.durationMs;
    const shortMaxDurationSeconds = this.getPositiveNumber(
      'MEDIA_SHORT_MAX_DURATION_SECONDS',
      180,
    );

    let mediaClass: ReelPipelineMediaClass = 'UNKNOWN';

    if (durationMs !== undefined && durationMs >= 0) {
      mediaClass =
        durationMs <= shortMaxDurationSeconds * 1000 ? 'SHORT' : 'LONG';
    }

    if (!dimensions) {
      return {
        orientation: 'UNKNOWN',
        mediaClass,
      };
    }

    const aspectRatio = dimensions.width / dimensions.height;
    let orientation: ReelPipelineOrientation = 'SQUARE';

    if (aspectRatio >= 1.1) {
      orientation = 'LANDSCAPE';
    } else if (aspectRatio <= 0.9) {
      orientation = 'PORTRAIT';
    }

    return {
      orientation,
      mediaClass,
      effectiveWidth: dimensions.width,
      effectiveHeight: dimensions.height,
      aspectRatio: Number(aspectRatio.toFixed(4)),
    };
  }

  private getEffectiveDimensions(
    metadata: VideoMetadata,
  ): { width: number; height: number } | null {
    if (!metadata.width || !metadata.height) {
      return null;
    }

    const rotation = this.normalizeRotation(metadata.rotation);

    if (rotation === 90 || rotation === 270) {
      return {
        width: metadata.height,
        height: metadata.width,
      };
    }

    return {
      width: metadata.width,
      height: metadata.height,
    };
  }

  private normalizeRotation(rotation?: number): number {
    if (rotation === undefined || !Number.isFinite(rotation)) {
      return 0;
    }

    return ((Math.round(rotation) % 360) + 360) % 360;
  }

  private getPositiveNumber(key: string, fallback: number): number {
    const value = Number(this.configService.get<string>(key) ?? fallback);

    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}
