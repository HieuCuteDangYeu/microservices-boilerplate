import { CallTelemetryTokenService } from '@common/calls/call-telemetry-token.service';
import { Injectable } from '@nestjs/common';
import type { ICallTelemetryTokenVerifier } from '../../domain/interfaces/call-telemetry-token-verifier.interface';

@Injectable()
export class CallTelemetryTokenVerifierAdapter implements ICallTelemetryTokenVerifier {
  constructor(private readonly tokenService: CallTelemetryTokenService) {}

  verify(token: string) {
    return this.tokenService.verify(token);
  }
}
