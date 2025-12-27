import { InternalUpdateUserDto } from '../dtos/update-user.dto';
import { UserResponse } from './find-all-users.types';

export interface UpdateUserPayload {
  id: string;
  data: InternalUpdateUserDto;
}

export type UpdateUserResponse = UserResponse;
