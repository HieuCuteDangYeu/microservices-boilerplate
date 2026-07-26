/**
 * TEMPORARY REEL INDEXING/RETRIEVAL MIGRATION TEST
 * Remove only after production validation.
 */

import { SearchPublicReelsUseCase } from './search-public-reels.use-case';

describe('Prompt 6 public semantic-search ownership', () => {
  it('uses Indexing results and never calls Content legacy search', async () => {
    const contentRepository = {
      searchPublicReels: jest.fn(),
      findSearchablePublicReels: jest.fn().mockResolvedValue([{ id: 'reel-1' }]),
    };
    const semanticSearch = {
      searchPublicReels: jest.fn().mockResolvedValue([
        { reelId: 'reel-1', score: 0.8 },
      ]),
    };
    const useCase = new SearchPublicReelsUseCase(
      contentRepository as never,
      semanticSearch,
    );

    await expect(useCase.execute({ query: 'beach' })).resolves.toEqual([
      { reel: { id: 'reel-1' }, score: 0.8 },
    ]);
    expect(contentRepository.searchPublicReels).not.toHaveBeenCalled();
  });
});
