export interface AuthUser {
  id: string;
  email: string;
  fullName?: string;
  username?: string;
  picture?: string;
  isVerified?: boolean;
  roles: string[];
}
