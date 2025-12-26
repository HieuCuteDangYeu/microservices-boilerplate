import { Inject, Injectable, Logger } from '@nestjs/common';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import type { IUserRepository } from '../../domain/interfaces/user.repository.interface';

@Injectable()
export class VerifyUserUseCase {
  private readonly logger = new Logger(VerifyUserUseCase.name);

  constructor(
    @Inject('IUserRepository') private readonly userRepository: IUserRepository,
  ) {}

  async execute(id: string): Promise<void> {
    try {
      await this.userRepository.update(id, { isVerified: true });
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Failed to verify user ${id}`, error.stack);
      } else {
        this.logger.error(`Failed to verify user ${id}`, String(error));
      }

      throw new UserNotFoundError(id);
    }
  }
}
