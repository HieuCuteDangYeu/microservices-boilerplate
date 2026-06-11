import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const ShareReelSchema = z.object({
  conversationId: z.string().min(1, 'conversationId is required'),
  sharedWithUserId: z
    .string()
    .min(1, 'sharedWithUserId cannot be empty')
    .optional(),
});

export class ShareReelDto extends createZodDto(ShareReelSchema) {}
