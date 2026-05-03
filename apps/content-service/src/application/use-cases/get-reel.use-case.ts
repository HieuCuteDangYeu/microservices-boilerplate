import { Reel } from '@content/domain/entities/reel.entity';
import type { IContentRepository } from '@content/domain/interfaces/content.repository.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class GetReelUseCase {
  constructor(
    @Inject('IContentRepository')
    private readonly repository: IContentRepository,
  ) {}

  async execute(id: string): Promise<Reel | null> {
    try {
      return await this.repository.incrementViewCount(id);
    } catch {
      return null;
    }
  }
}
