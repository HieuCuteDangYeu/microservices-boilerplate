import { createZodDto } from 'nestjs-zod';
import z from 'zod';

export const SendFriendRequestSchema = z.object({
  recipientId: z.uuid(),
});

export class SendFriendRequestDto extends createZodDto(
  SendFriendRequestSchema,
) {}
