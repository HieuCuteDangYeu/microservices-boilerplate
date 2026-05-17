export interface PrivateUserProfile {
  id: string;
  email: string;
  fullName: string;
  username: string;
  picture: string | null;
  isVerified: boolean;
  createdAt: Date;
}
