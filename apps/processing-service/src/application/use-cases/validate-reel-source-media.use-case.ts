import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VideoMetadata } from '../../domain/interfaces/video-processing.service.interface';

export class ReelSourceMediaValidationError extends Error {
  constructor(
    readonly errorCode: string,
    readonly publicMessage: string,
    readonly detail: string,
  ) {
    super(publicMessage);
    this.name = 'ReelSourceMediaValidationError';
  }
}

@Injectable()
export class ValidateReelSourceMediaUseCase {
  constructor(private readonly configService: ConfigService) {}

  execute(metadata: VideoMetadata): void {
    const minDurationMs =
      this.getPositiveInt('REEL_MIN_DURATION_SECONDS', 1, 1, 30) * 1000;

    const maxDurationMs =
      this.getPositiveInt('REEL_MAX_DURATION_SECONDS', 180, 10, 600) * 1000;

    const maxSourceLongSide = this.getPositiveInt(
      'REEL_MAX_SOURCE_LONG_SIDE',
      2160,
      480,
      4096,
    );

    const maxSourceFps = this.getPositiveInt(
      'REEL_MAX_SOURCE_FPS',
      60,
      24,
      120,
    );

    if (!metadata.durationMs || metadata.durationMs <= 0) {
      throw new ReelSourceMediaValidationError(
        'VIDEO_METADATA_UNREADABLE',
        'This video format is not supported.',
        'Video duration is missing or invalid.',
      );
    }

    if (!metadata.width || !metadata.height) {
      throw new ReelSourceMediaValidationError(
        'VIDEO_METADATA_UNREADABLE',
        'This video format is not supported.',
        'Video width or height is missing.',
      );
    }

    if (metadata.durationMs < minDurationMs) {
      throw new ReelSourceMediaValidationError(
        'VIDEO_TOO_SHORT',
        'This video is too short. Please upload a longer reel.',
        `Video duration ${metadata.durationMs}ms is below minimum ${minDurationMs}ms.`,
      );
    }

    if (metadata.durationMs > maxDurationMs) {
      throw new ReelSourceMediaValidationError(
        'VIDEO_TOO_LONG',
        'This video is too long. Please upload a shorter reel.',
        `Video duration ${metadata.durationMs}ms exceeds maximum ${maxDurationMs}ms.`,
      );
    }

    const effectiveWidth = this.getEffectiveWidth(metadata);
    const effectiveHeight = this.getEffectiveHeight(metadata);
    const longSide = Math.max(effectiveWidth, effectiveHeight);

    if (longSide > maxSourceLongSide) {
      throw new ReelSourceMediaValidationError(
        'VIDEO_RESOLUTION_TOO_HIGH',
        'This video is too large. Please upload a smaller reel.',
        `Video long side ${longSide}px exceeds maximum ${maxSourceLongSide}px.`,
      );
    }

    if (metadata.fps && metadata.fps > maxSourceFps + 1) {
      throw new ReelSourceMediaValidationError(
        'VIDEO_FPS_TOO_HIGH',
        'This video format is not supported.',
        `Video FPS ${metadata.fps} exceeds maximum ${maxSourceFps}.`,
      );
    }
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

  private getEffectiveWidth(metadata: VideoMetadata): number {
    if (metadata.rotation === 90 || metadata.rotation === 270) {
      return metadata.height ?? 0;
    }

    return metadata.width ?? 0;
  }

  private getEffectiveHeight(metadata: VideoMetadata): number {
    if (metadata.rotation === 90 || metadata.rotation === 270) {
      return metadata.width ?? 0;
    }

    return metadata.height ?? 0;
  }
}
