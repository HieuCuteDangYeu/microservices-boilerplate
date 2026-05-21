import { PublicUserProfile } from '@common/user/interfaces/public-user-profile.types';
import { Inject, Injectable } from '@nestjs/common';
import type { IUserRepository } from '../../domain/interfaces/user.repository.interface';

@Injectable()
export class SearchPublicUsersUseCase {
  constructor(
    @Inject('IUserRepository') private readonly userRepository: IUserRepository,
  ) {}

  async execute(
    query: string,
    limit: number,
    excludeUserId?: string,
  ): Promise<PublicUserProfile[]> {
    const trimmedQuery = query.trim();
    const normalizedQuery = trimmedQuery.replace(/^@+/, '');
    const users = await this.userRepository.searchPublicUsers({
      query: normalizedQuery || trimmedQuery,
      limit,
      excludeUserId,
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
