import type { TelemetryRole } from '../models/call-telemetry.model';

export type VerifiedCallTelemetryToken = {
  callId: string;
  role: TelemetryRole;
};

export interface ICallTelemetryTokenVerifier {
  verify(token: string): VerifiedCallTelemetryToken | null;
}
