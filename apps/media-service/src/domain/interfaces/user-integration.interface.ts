export interface IUserIntegrationService {
  notifyAvatarUpdated(userId: string, avatarUrl: string): void;
}
