export interface IIndexingApplicationConfig {
  get<T = string>(key: string): T | undefined;
  transcriptionIdentity(): {
    provider: string;
    model: string;
    version: string;
  };
  embeddingIdentity(): {
    model: string;
    dimensions: number;
    version: string;
  };
}
