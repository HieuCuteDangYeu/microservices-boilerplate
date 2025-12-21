import { UpdateUserDto } from '../dtos/update-user.dto';
import { UserResponse } from './find-all-users.types';

export interface UpdateUserPayload {
  id: string;
  data: UpdateUserDto;
}

export type UpdateUserResponse = UserResponse;
