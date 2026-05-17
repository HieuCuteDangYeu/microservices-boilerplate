export interface JwtPayload {
  sub: string;
  email: string;
  fullName?: string;
  username?: string;
  picture?: string;
  isVerified?: boolean;
}
