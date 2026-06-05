import type {
  ExtractUserMemoriesRequest,
  ExtractUserMemoriesResult,
} from '@common/ai/interfaces/extract-user-memory.interface';

export interface IMemoryExtractorService {
  extract(
    input: ExtractUserMemoriesRequest,
  ): Promise<ExtractUserMemoriesResult>;
}
