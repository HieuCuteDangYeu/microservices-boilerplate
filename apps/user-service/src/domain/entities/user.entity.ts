export class User {
  constructor(
    public readonly id: string,
    public readonly email: string,
    public readonly password: string | null,
    public readonly isVerified: boolean,
    public readonly createdAt: Date,
    public readonly picture: string | null,
    public readonly provider: string | null,
    public readonly providerId: string | null,
  ) {}
}
