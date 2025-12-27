import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { IAuthRepository } from '../../domain/interfaces/auth.repository.interface';

@Injectable()
export class TokenCleanupService {
  private readonly logger = new Logger(TokenCleanupService.name);

  constructor(
    @Inject('IAuthRepository') private readonly authRepository: IAuthRepository,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCleanup() {
    this.logger.log('Starting scheduled cleanup of expired refresh tokens...');

    try {
      const count = await this.authRepository.deleteExpiredAndRevokedTokens();
      this.logger.log(
        `Cleanup complete. Deleted ${count} expired/revoked tokens.`,
      );
    } catch (error) {
      this.logger.error('Failed to cleanup tokens', error);
    }
  }
}
