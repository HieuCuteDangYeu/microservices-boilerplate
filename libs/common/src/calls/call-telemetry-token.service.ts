import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

export type CallTelemetryTokenPayload = {
  callId: string;
  role: 'host' | 'guest';
  expiresAt: number;
};

@Injectable()
export class CallTelemetryTokenService {
  constructor(private readonly configService: ConfigService) {}

  issue(callId: string, role: 'host' | 'guest') {
    const payload: CallTelemetryTokenPayload = {
      callId,
      role,
      expiresAt: Date.now() + 31 * 24 * 60 * 60 * 1000,
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      'base64url',
    );
    return `${encodedPayload}.${this.sign(encodedPayload)}`;
  }

  verify(token: string): CallTelemetryTokenPayload | null {
    const [encodedPayload, signature] = token.split('.');
    if (!encodedPayload || !signature) return null;

    const expectedSignature = this.sign(encodedPayload);
    if (signature.length !== expectedSignature.length) return null;
    if (
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
    )
      return null;

    try {
      const payload = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString('utf8'),
      ) as CallTelemetryTokenPayload;
      if (!payload.callId || !['host', 'guest'].includes(payload.role))
        return null;
      return payload.expiresAt > Date.now() ? payload : null;
    } catch {
      return null;
    }
  }

  private sign(value: string) {
    const configuredSecret = this.configService.get<string>(
      'CALL_TELEMETRY_SECRET',
    );
    if (!configuredSecret && process.env.NODE_ENV === 'production') {
      throw new Error('CALL_TELEMETRY_SECRET is required in production');
    }

    return createHmac(
      'sha256',
      configuredSecret || 'development-call-telemetry-secret',
    )
      .update(value)
      .digest('base64url');
  }
}
