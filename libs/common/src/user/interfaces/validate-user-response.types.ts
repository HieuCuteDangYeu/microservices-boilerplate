export interface ValidateUserResponse {
  id: string;
  email: string;
  isVerified: boolean;
  provider?: string | null;
  providerId?: string | null;
  picture?: string | null;
}
