export interface AuthUser {
  id: string;
  email: string;
  fullName?: string;
  username?: string | null;
  picture?: string;
  isVerified?: boolean;
  roles: string[];
}
