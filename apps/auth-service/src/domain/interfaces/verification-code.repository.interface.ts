export interface IVerificationCodeRepository {
  save(code: string, userId: string, ttlSeconds: number): Promise<void>;
  getUserId(code: string): Promise<string | null>;
  delete(code: string): Promise<void>;
}
