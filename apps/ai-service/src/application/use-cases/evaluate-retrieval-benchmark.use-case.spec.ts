import { EvaluateRetrievalBenchmarkUseCase } from './evaluate-retrieval-benchmark.use-case';

describe('EvaluateRetrievalBenchmarkUseCase', () => {
  const useCase = new EvaluateRetrievalBenchmarkUseCase();

  it('compares direct and hierarchical ranking quality with standard IR metrics', () => {
    const result = useCase.execute(
      [
        {
          id: 'case-1',
          relevantIds: ['a', 'b'],
          directRankedIds: ['x', 'a', 'y', 'b'],
          hierarchicalRankedIds: ['a', 'b', 'x'],
        },
        {
          id: 'case-2',
          relevantIds: ['c'],
          directRankedIds: ['x', 'y', 'c'],
          hierarchicalRankedIds: ['c', 'x'],
        },
      ],
      3,
    );

    expect(result.cases).toBe(2);
    expect(result.k).toBe(3);
    expect(result.hierarchical.recallAtK).toBeGreaterThan(
      result.direct.recallAtK,
    );
    expect(result.hierarchical.reciprocalRank).toBeGreaterThan(
      result.direct.reciprocalRank,
    );
    expect(result.hierarchical.ndcgAtK).toBeGreaterThan(
      result.direct.ndcgAtK,
    );
    expect(result.delta.reciprocalRank).toBeGreaterThan(0);
  });

  it('returns zeroed metrics when no labelled cases are usable', () => {
    expect(
      useCase.execute([
        {
          id: 'empty',
          relevantIds: [],
          directRankedIds: [],
          hierarchicalRankedIds: [],
        },
      ]),
    ).toEqual({
      cases: 0,
      k: 5,
      direct: { recallAtK: 0, reciprocalRank: 0, ndcgAtK: 0 },
      hierarchical: { recallAtK: 0, reciprocalRank: 0, ndcgAtK: 0 },
      delta: { recallAtK: 0, reciprocalRank: 0, ndcgAtK: 0 },
    });
  });
});
