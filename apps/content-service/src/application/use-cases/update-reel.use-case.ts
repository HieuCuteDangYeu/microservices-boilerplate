import { Reel } from '@content/domain/entities/reel.entity';
import type {
  IContentRepository,
  ReelUpdateData,
} from '@content/domain/interfaces/content.repository.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class UpdateReelUseCase {
  constructor(
    @Inject('IContentRepository')
    private readonly repository: IContentRepository,
  ) {}

  async execute(
    id: string,
    data: ReelUpdateData,
    userId: string,
  ): Promise<Reel | null> {
    return this.repository.updateReel(id, data, userId);
  }
}
