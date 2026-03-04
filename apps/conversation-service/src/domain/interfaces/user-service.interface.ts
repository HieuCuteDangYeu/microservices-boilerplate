import { ValidateUserResponse } from '@common/user/interfaces/validate-user-response.types';

export interface IUserService {
  validateUsers(ids: string[]): Promise<boolean>;
  findUsersByIds(ids: string[]): Promise<ValidateUserResponse | null>;
}
