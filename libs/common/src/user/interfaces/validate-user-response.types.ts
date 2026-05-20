export interface ValidateUserResponse {
  id: string;
  email: string;
  fullName?: string;
  username?: string | null;
  isVerified?: boolean;
  provider?: string | null;
  providerId?: string | null;
  picture?: string | null;
  password?: string | null;
}
