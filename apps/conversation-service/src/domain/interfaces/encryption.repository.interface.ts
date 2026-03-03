export interface IEncryptionRepository {
  encrypt(text: string): string;
  decrypt(text: string): string;
}
