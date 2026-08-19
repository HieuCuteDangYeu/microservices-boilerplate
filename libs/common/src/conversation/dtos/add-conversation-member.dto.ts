import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const AddConversationMemberSchema = z.object({
  userId: z.string().trim().min(1),
});

export class AddConversationMemberDto extends createZodDto(
  AddConversationMemberSchema,
) {}
