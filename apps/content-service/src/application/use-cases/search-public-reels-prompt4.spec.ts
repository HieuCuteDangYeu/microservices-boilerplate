/**
 * TEMPORARY REEL INDEXING/RETRIEVAL MIGRATION TEST
 * Remove only after production validation.
 */

import { SearchPublicReelsUseCase } from './search-public-reels.use-case';

describe('Prompt 4 public semantic-search fallback', () => {
  it('uses the frozen Content search only when the emergency flag is enabled', async () => {
    const legacyResult = { reel: { id: 'legacy-reel' }, score: 0.8 };
    const contentRepository = {
      searchPublicReels: jest.fn().mockResolvedValue([legacyResult]),
      findSearchablePublicReels: jest.fn(),
    };
    const semanticSearch = {
      searchPublicReels: jest
        .fn()
        .mockRejectedValue(new Error('indexing down')),
    };
    const config = {
      get: jest.fn((key: string) =>
        key === 'PUBLIC_SEARCH_INDEXING_SERVICE_ENABLED'
          ? 'true'
          : key === 'LEGACY_CONTENT_SEMANTIC_READ_FALLBACK_ENABLED'
            ? 'true'
            : undefined,
      ),
    };
    const useCase = new SearchPublicReelsUseCase(
      contentRepository as never,
      semanticSearch,
      config as never,
    );

    await expect(useCase.execute({ query: 'beach' })).resolves.toEqual([
      legacyResult,
    ]);
    expect(contentRepository.searchPublicReels).toHaveBeenCalledWith({
      query: 'beach',
      viewerId: undefined,
      limit: undefined,
    });
  });
});
