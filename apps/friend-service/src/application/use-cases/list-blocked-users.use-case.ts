import type { BlockedUserSummary } from '@common/friend/interfaces/blocked-user.types';
import type { PublicUserProfile } from '@common/user/interfaces/public-user-profile.types';
import type {
  IUserBlockRepository,
  UserBlockPaginationCursor,
} from '@friend/domain/interfaces/user-block.repository.interface';
import type { IUserService } from '@friend/domain/interfaces/user-service.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class ListBlockedUsersUseCase {
  constructor(
    @Inject('IUserBlockRepository')
    private readonly userBlockRepository: IUserBlockRepository,

    @Inject('IUserService')
    private readonly userService: IUserService,
  ) {}

  async execute(
    userId: string,
    limit: number = 20,
    cursor?: UserBlockPaginationCursor,
  ): Promise<{
    items: BlockedUserSummary[];
    nextCursor: UserBlockPaginationCursor | null;
  }> {
    const page = await this.userBlockRepository.listBlocked(
      userId,
      limit,
      cursor,
    );

    const blockedUserIds = [
      ...new Set(page.items.map((item) => item.blockedUserId)),
    ];

    const profiles =
      await this.userService.findPublicUsersByIds(blockedUserIds);

    const profilesById = new Map<string, PublicUserProfile>(
      profiles.map((profile): [string, PublicUserProfile] => [
        profile.id,
        profile,
      ]),
    );

    return {
      items: page.items.map((item) => ({
        blockedAt: item.createdAt,
        user:
          profilesById.get(item.blockedUserId) ??
          this.createFallbackProfile(item.blockedUserId),
      })),
      nextCursor: page.nextCursor,
    };
  }

  private createFallbackProfile(userId: string): PublicUserProfile {
    return {
      id: userId,
      fullName: 'Unknown User',
      username: null,
      picture: null,
      isVerified: false,
    };
  }
}
