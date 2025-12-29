import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const GetPresignedUrlSchema = z.object({
  fileName: z.string().min(1),
  fileType: z.string().regex(/^image\/(jpeg|png|webp)$/),
});

export class GetPresignedUrlDto extends createZodDto(GetPresignedUrlSchema) {}
