import { Reel } from '../entities/reel.entity';

export interface IContentRepository {
  createReel(reel: Partial<Reel>): Promise<Reel>;
  updateReelStatus(
    id: string,
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED',
  ): Promise<Reel>;
}
