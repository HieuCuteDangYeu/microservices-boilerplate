export class Media {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly key: string,
    public readonly url: string,
    public readonly mimeType: string,
    public readonly createdAt: Date,
  ) {}
}
