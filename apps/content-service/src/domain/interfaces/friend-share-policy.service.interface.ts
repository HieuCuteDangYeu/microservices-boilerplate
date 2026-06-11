export interface CanShareWithUserResult {
  allowed: boolean;
  reason?: string;
}

export interface IFriendSharePolicyService {
  canShareWithUser(input: {
    requesterId: string;
    targetUserId: string;
  }): Promise<CanShareWithUserResult>;
}
