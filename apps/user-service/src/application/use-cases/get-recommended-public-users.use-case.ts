import { PublicUserProfile } from '@common/user/interfaces/public-user-profile.types';
import { Inject, Injectable } from '@nestjs/common';
import type { IUserRepository } from '../../domain/interfaces/user.repository.interface';

@Injectable()
export class GetRecommendedPublicUsersUseCase {
  constructor(
    @Inject('IUserRepository')
    private readonly userRepository: IUserRepository,
  ) {}

  async execute(input: {
    limit?: number;
    excludeUserId?: string;
  }): Promise<PublicUserProfile[]> {
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 30);

    const users = await this.userRepository.findRecommendedPublicUsers({
      limit,
      excludeUserId: input.excludeUserId,
    });

    return users.map((user) => ({
      id: user.id!,
      fullName: user.fullName,
      username: user.username,
      picture: user.picture,
      isVerified: user.isVerified,
    }));
  }
}
