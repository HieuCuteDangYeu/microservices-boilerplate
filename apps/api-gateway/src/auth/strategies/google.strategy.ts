import { TokenResponse } from '@common/auth/interfaces/token.interface';
import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PassportStrategy } from '@nestjs/passport';
import {
  Profile,
  Strategy,
  StrategyOptions,
  VerifyCallback,
} from 'passport-google-oauth20';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
  ) {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      callbackURL:
        process.env.GOOGLE_CALLBACK_URL ||
        'http://localhost:3000/auth/google/callback',
      scope: ['email', 'profile'],
    } as StrategyOptions);
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<void> {
    const { emails, photos } = profile;

    const userPayload = {
      email: emails?.[0]?.value,
      picture: photos?.[0]?.value,
      provider: 'google',
      providerId: profile.id,
    };

    try {
      const jwtTokens = await lastValueFrom(
        this.authClient.send<TokenResponse>('auth.login_google', userPayload),
      );

      done(null, jwtTokens);
    } catch (error) {
      done(error as Error, undefined);
    }
  }
}
