import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const FinalizeUploadSchema = z.object({
  key: z.string().min(1, 'Upload key is required'),
  thumbnailKey: z.string().min(1, 'Thumbnail key cannot be empty').optional(),
  fileType: z
    .string()
    .regex(
      /^(image\/(jpeg|png|webp)|video\/(mp4|quicktime|webm))$/,
      'Unsupported file type',
    ),
});

export class FinalizeUploadDto extends createZodDto(FinalizeUploadSchema) {}
