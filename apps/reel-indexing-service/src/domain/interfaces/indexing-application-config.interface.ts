export interface IIndexingApplicationConfig {
  get<T = string>(key: string): T | undefined;
}
