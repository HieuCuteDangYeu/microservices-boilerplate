export interface IMailService {
  sendConfirmationEmail(email: string, token: string): void;
}
