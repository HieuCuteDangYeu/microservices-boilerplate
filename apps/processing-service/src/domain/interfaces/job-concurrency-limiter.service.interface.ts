export interface IJobConcurrencyLimiterService {
  runExclusive<T>(job: () => Promise<T>, limit: number): Promise<T>;
}
