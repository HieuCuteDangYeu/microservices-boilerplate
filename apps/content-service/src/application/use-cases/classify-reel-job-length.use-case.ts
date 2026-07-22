import type { ReelMediaLengthClass } from '@common/processing/interfaces/reel-media-job.interface';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ClassifyReelJobLengthUseCase {
  constructor(private readonly configService: ConfigService) {}

  execute(clientObservedDurationMs?: number): ReelMediaLengthClass {
    if (
      clientObservedDurationMs === undefined ||
      !Number.isFinite(clientObservedDurationMs) ||
      clientObservedDurationMs <= 0
    ) {
      return 'UNKNOWN';
    }

    const shortMaxSeconds = this.getPositiveNumber(
      'MEDIA_SHORT_MAX_DURATION_SECONDS',
      180,
    );
    const longMaxSeconds = this.getPositiveNumber(
      'MEDIA_LONG_MAX_DURATION_SECONDS',
      7200,
    );

    if (clientObservedDurationMs <= shortMaxSeconds * 1000) {
      return 'SHORT';
    }

    if (clientObservedDurationMs <= longMaxSeconds * 1000) {
      return 'LONG';
    }

    return 'UNKNOWN';
  }

  private getPositiveNumber(key: string, fallback: number): number {
    const parsed = Number(this.configService.get<string>(key) ?? fallback);

    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
