export class IndexClassificationMismatchError extends Error {
  constructor(input: {
    provided: 'SHORT' | 'LONG';
    calculated: 'SHORT' | 'LONG';
    durationMs: number;
  }) {
    super(
      `Index classification mismatch: provided=${input.provided}, calculated=${input.calculated}, durationMs=${input.durationMs}`,
    );
    this.name = 'IndexClassificationMismatchError';
  }
}
