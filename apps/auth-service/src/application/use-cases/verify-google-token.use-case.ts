import { GoogleProfile } from '@common/auth/interfaces/google-profile.interface';
import { Injectable } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { GoogleLoginUseCase } from './google-login.use-case';

@Injectable()
export class VerifyGoogleTokenUseCase {
  private readonly googleClient: OAuth2Client;

  constructor(private readonly googleLoginUseCase: GoogleLoginUseCase) {
    this.googleClient = new OAuth2Client();
  }

  async execute(idToken: string) {
    try {
      const validAudiences = [
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_IOS_CLIENT_ID,
        process.env.GOOGLE_ANDROID_CLIENT_ID,
      ].filter(Boolean) as string[];

      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: validAudiences,
      });

      const payload = ticket.getPayload();

      if (!payload || !payload.email || !payload.sub) {
        throw new Error('Invalid Google token payload');
      }

      const profile: GoogleProfile = {
        email: payload.email,
        picture: payload.picture,
        providerId: payload.sub,
        provider: 'google',
      };

      return await this.googleLoginUseCase.execute(profile);
    } catch (error) {
      console.error('Google token verification failed:', error);
      throw error;
    }
  }
}
