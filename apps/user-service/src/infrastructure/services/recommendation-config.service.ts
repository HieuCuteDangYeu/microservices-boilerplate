import type { RecommendationFeatureFlags } from '@common/recommendation/interfaces/recommendation-metadata.interface';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IRecommendationConfig } from '@user/domain/interfaces/recommendation-config.interface';

const VERSION_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

@Injectable()
export class RecommendationConfigService implements IRecommendationConfig {
  private readonly algorithmVersion: string;
  private readonly telemetryEnabled: boolean;
  private readonly interestPoolEnabled: boolean;

  constructor(private readonly configService: ConfigService) {
    this.algorithmVersion = this.readVersion(
      'USER_RECOMMENDATION_VERSION',
      'public-user-fallback-v1',
    );

    this.telemetryEnabled = this.readBoolean(
      'RECOMMENDATION_TELEMETRY_ENABLED',
      true,
    );

    this.interestPoolEnabled = this.readBoolean(
      'USER_INTEREST_POOL_ENABLED',
      false,
    );
  }

  getAlgorithmVersion(): string {
    return this.algorithmVersion;
  }

  getCandidateSource(): string {
    return 'PUBLIC_USER_FALLBACK';
  }

  getFeatureFlags(): RecommendationFeatureFlags {
    return {
      interestPool: this.interestPoolEnabled,
    };
  }

  isTelemetryEnabled(): boolean {
    return this.telemetryEnabled;
  }

  private readVersion(key: string, fallback: string): string {
    const value = this.configService.get<string>(key)?.trim() || fallback;

    if (!VERSION_PATTERN.test(value)) {
      throw new Error(`${key} has an invalid value`);
    }

    return value;
  }

  private readBoolean(key: string, fallback: boolean): boolean {
    const value = this.configService.get<string | boolean>(key);

    if (value === undefined || value === null || value === '') {
      return fallback;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    const normalized = value.trim().toLowerCase();

    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }

    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }

    throw new Error(`${key} has an invalid boolean value`);
  }
}
