export interface IMailSender {
  send(
    to: string,
    subject: string,
    template: string,
    context: Record<string, unknown>,
  ): Promise<void>;
}
