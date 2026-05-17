import { UsernameAvailabilityResponse } from '@common/user/interfaces/username-availability.types';
import { Inject, Injectable } from '@nestjs/common';
import { normalizeUsername } from '@user/application/utils/public-identity.utils';
import type { IUserRepository } from '../../domain/interfaces/user.repository.interface';

@Injectable()
export class CheckUsernameAvailabilityUseCase {
  constructor(
    @Inject('IUserRepository') private readonly userRepository: IUserRepository,
  ) {}

  async execute(rawUsername: string): Promise<UsernameAvailabilityResponse> {
    const username = normalizeUsername(rawUsername);
    const available = await this.userRepository.isUsernameAvailable(username);

    return {
      username,
      available,
    };
  }
}
