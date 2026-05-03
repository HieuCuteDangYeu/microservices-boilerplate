import { TranscriptSearchResult } from '@common/content/interfaces/transcript-search-result.interface';
import { Reel } from '../entities/reel.entity';

export interface IContentRepository {
  createReel(reel: Partial<Reel>): Promise<Reel>;
  updateReelStatus(
    id: string,
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED',
    transcript?: string,
    embedding?: number[],
  ): Promise<Reel>;
  findById(id: string): Promise<Reel | null>;
  searchTranscripts(queryVector: number[]): Promise<TranscriptSearchResult[]>;
}
