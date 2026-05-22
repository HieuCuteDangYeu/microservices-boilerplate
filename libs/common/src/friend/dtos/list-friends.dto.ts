import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { FriendPaginationSchema } from './friend-pagination.dto';

export const ListFriendsSchema = FriendPaginationSchema.extend({
  userId: z.string().uuid().optional(),
});

export class ListFriendsDto extends createZodDto(ListFriendsSchema) {}
