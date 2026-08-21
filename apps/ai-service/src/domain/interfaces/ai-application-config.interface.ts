export interface IAiApplicationConfig {
  get<T = string>(key: string): T | undefined;
}
