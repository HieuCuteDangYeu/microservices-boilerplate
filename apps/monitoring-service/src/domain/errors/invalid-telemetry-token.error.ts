export class InvalidTelemetryTokenError extends Error {
  constructor() {
    super('Invalid call telemetry token');
  }
}
