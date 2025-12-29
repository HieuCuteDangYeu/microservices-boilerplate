import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const ConfirmUploadSchema = z.object({
  key: z.string().min(1),
  mimeType: z.string(),
});

export class ConfirmUploadDto extends createZodDto(ConfirmUploadSchema) {}
