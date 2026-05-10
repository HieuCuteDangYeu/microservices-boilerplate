export interface IStorageService {
  checkFileExists(key: string): Promise<boolean>;
  deleteObjects(keys: string[]): Promise<void>;
  listObjects(prefix: string): Promise<string[]>;
}
