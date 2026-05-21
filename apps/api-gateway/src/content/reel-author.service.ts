import { ReelAuthorSummary } from '@common/content/interfaces/reel-response.interface';
import { PublicUserProfile } from '@common/user/interfaces/public-user-profile.types';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { catchError, lastValueFrom, of } from 'rxjs';

@Injectable()
export class ReelAuthorService {
  private readonly logger = new Logger(ReelAuthorService.name);

  constructor(
    @Inject('USER_SERVICE') private readonly userClient: ClientProxy,
  ) {}

  async loadAuthorMap(
    userIds: string[],
  ): Promise<Map<string, ReelAuthorSummary>> {
    const uniqueIds = [...new Set(userIds.filter(Boolean))];

    if (uniqueIds.length === 0) {
      return new Map();
    }

    const fallbackEntries = uniqueIds.map(
      (userId) => [userId, this.buildFallbackAuthor(userId)] as const,
    );

    const profiles = await lastValueFrom(
      this.userClient
        .send<PublicUserProfile[]>('user.find_public_by_ids', uniqueIds)
        .pipe(
          catchError((error: unknown) => {
            const message =
              error instanceof Error ? error.message : String(error);

            this.logger.warn(
              `Failed to load reel author summaries: ${message}`,
            );

            return of([] as PublicUserProfile[]);
          }),
        ),
    );

    const authorsById = new Map<string, ReelAuthorSummary>(fallbackEntries);

    for (const profile of profiles) {
      authorsById.set(profile.id, this.toAuthorSummary(profile));
    }

    return authorsById;
  }

  resolveAuthor(
    authorsById: Map<string, ReelAuthorSummary>,
    userId: string,
  ): ReelAuthorSummary {
    return authorsById.get(userId) ?? this.buildFallbackAuthor(userId);
  }

  private toAuthorSummary(profile: PublicUserProfile): ReelAuthorSummary {
    return {
      id: profile.id,
      username: profile.username,
      displayName: profile.fullName ?? null,
      avatarUrl: profile.picture,
      isVerified: profile.isVerified,
    };
  }

  private buildFallbackAuthor(userId: string): ReelAuthorSummary {
    return {
      id: userId,
      username: null,
      displayName: null,
      avatarUrl: null,
      isVerified: null,
    };
  }
}
