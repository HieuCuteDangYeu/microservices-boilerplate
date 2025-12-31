export interface IMailService {
  sendConfirmationEmail(email: string, token: string): void;
  sendPasswordResetEmail(email: string, token: string): void;
}
