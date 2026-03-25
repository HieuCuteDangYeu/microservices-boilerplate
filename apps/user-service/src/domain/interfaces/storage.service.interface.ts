export interface IStorageService {
  checkFileExists(key: string): Promise<boolean>;
}
