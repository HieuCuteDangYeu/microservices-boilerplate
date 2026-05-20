export interface JwtPayload {
  sub: string;
  email: string;
  fullName?: string;
  username?: string | null;
  picture?: string;
  isVerified?: boolean;
}
