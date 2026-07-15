import { Reel } from '@content/domain/entities/reel.entity';
import type { IContentRepository } from '@content/domain/interfaces/content.repository.interface';
import type { IFriendContentAccessService } from '@content/domain/interfaces/friend-content-access.service.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class GetReelUseCase {
  constructor(
    @Inject('IContentRepository')
    private readonly repository: IContentRepository,
    @Inject('IFriendContentAccessService')
    private readonly friendContentAccessService: IFriendContentAccessService,
  ) {}

  async execute(id: string, viewerId: string): Promise<Reel | null> {
    const reel = await this.repository.findById(id);

    if (!reel) {
      return null;
    }

    const allowed = await this.friendContentAccessService.canView({
      viewerId,
      ownerId: reel.userId,
      visibility: reel.visibility,
    });

    return allowed ? reel : null;
  }
}
