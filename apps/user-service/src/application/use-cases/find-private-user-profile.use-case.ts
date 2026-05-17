import { PrivateUserProfile } from '@common/user/interfaces/private-user-profile.types';
import { Inject, Injectable } from '@nestjs/common';
import { UserNotFoundError } from '@user/domain/errors/user-not-found.error';
import type { IUserRepository } from '../../domain/interfaces/user.repository.interface';

@Injectable()
export class FindPrivateUserProfileUseCase {
  constructor(
    @Inject('IUserRepository') private readonly userRepository: IUserRepository,
  ) {}

  async execute(userId: string): Promise<PrivateUserProfile> {
    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new UserNotFoundError(userId);
    }

    return {
      id: user.id!,
      email: user.email,
      fullName: user.fullName,
      username: user.username,
      picture: user.picture,
      isVerified: user.isVerified,
      createdAt: user.createdAt!,
    };
  }
}
