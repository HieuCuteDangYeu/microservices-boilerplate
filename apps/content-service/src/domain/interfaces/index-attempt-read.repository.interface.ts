export interface IIndexAttemptReadRepository {
  isIndexingAttemptCurrent(input: {
    reelId: string;
    indexAttemptId: string;
  }): Promise<boolean>;
}
