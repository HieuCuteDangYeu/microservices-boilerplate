export interface IMailSender {
  send(
    to: string,
    subject: string,
    template: string,
    context: any,
  ): Promise<void>;
}
