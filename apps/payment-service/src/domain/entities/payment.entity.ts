export class Payment {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly amount: number,
    public readonly currency: string,
    public readonly status: 'PENDING' | 'COMPLETED' | 'FAILED',
    public readonly provider: string,
    public readonly providerId: string,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}
}
