import { GoogleProfile } from '@common/auth/interfaces/google-profile.interface';
import { Injectable } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { GoogleAuthNotConfiguredError } from '../../domain/errors/google-auth-not-configured.error';
import { InvalidGoogleTokenError } from '../../domain/errors/invalid-google-token.error';
import { GoogleLoginUseCase } from './google-login.use-case';

@Injectable()
export class VerifyGoogleTokenUseCase {
  private readonly googleClient: OAuth2Client;

  constructor(private readonly googleLoginUseCase: GoogleLoginUseCase) {
    this.googleClient = new OAuth2Client();
  }

  async execute(idToken: string) {
    const validAudiences = [
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_IOS_CLIENT_ID,
      process.env.GOOGLE_ANDROID_CLIENT_ID,
    ].filter(Boolean) as string[];

    if (validAudiences.length === 0) {
      throw new GoogleAuthNotConfiguredError();
    }

    let payload:
      | {
          email?: string;
          name?: string;
          picture?: string;
          sub?: string;
        }
      | undefined;

    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: validAudiences,
      });

      payload = ticket.getPayload();
      if (!payload || !payload.email || !payload.sub) {
        throw new InvalidGoogleTokenError();
      }
    } catch (error) {
      console.error('Google token verification failed:', error);
      if (error instanceof InvalidGoogleTokenError) {
        throw error;
      }

      throw new InvalidGoogleTokenError();
    }

    const profile: GoogleProfile = {
      email: payload.email,
      fullName: payload.name,
      picture: payload.picture,
      providerId: payload.sub,
      provider: 'google',
    };

    return await this.googleLoginUseCase.execute(profile);
  }
}
