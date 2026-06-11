import type { ReelShareLink } from '@content/domain/entities/reel-share-link.entity';
import {
  ReelShareForbiddenError,
  ReelShareLinkNotFoundError,
} from '@content/domain/errors/content.error';
import type { IContentRepository } from '@content/domain/interfaces/content.repository.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class RevokeReelShareLinkUseCase {
  constructor(
    @Inject('IContentRepository')
    private readonly contentRepository: IContentRepository,
  ) {}

  async execute(input: {
    token: string;
    revokedByUserId: string;
  }): Promise<ReelShareLink> {
    const existing = await this.contentRepository.findReelShareLinkByToken(
      input.token,
    );

    if (!existing) {
      throw new ReelShareLinkNotFoundError();
    }

    if (
      existing.link.createdBy !== input.revokedByUserId &&
      existing.link.ownerId !== input.revokedByUserId
    ) {
      throw new ReelShareForbiddenError(
        'Only the reel owner or link creator can revoke this share link.',
      );
    }

    const revoked = await this.contentRepository.revokeReelShareLink(input);

    if (!revoked) {
      throw new ReelShareLinkNotFoundError();
    }

    return revoked;
  }
}
