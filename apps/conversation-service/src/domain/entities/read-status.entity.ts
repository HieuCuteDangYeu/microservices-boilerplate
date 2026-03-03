export class ReadStatus {
  userId: string;
  at: Date;

  constructor(partial: Partial<ReadStatus>) {
    Object.assign(this, partial);
  }
}
