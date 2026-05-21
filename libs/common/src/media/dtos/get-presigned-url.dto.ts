import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const GetPresignedUrlSchema = z.object({
  fileType: z
    .string()
    .regex(/^(image\/(jpeg|png|webp)|video\/(mp4|quicktime|webm))$/),
  purpose: z
    .enum(['avatar', 'chat', 'reel', 'chat_thumbnail'])
    .optional()
    .default('chat'),
});

export class GetPresignedUrlDto extends createZodDto(GetPresignedUrlSchema) {}
