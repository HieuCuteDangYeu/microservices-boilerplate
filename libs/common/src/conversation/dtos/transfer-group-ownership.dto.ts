import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const TransferGroupOwnershipSchema = z.object({
  userId: z.string().trim().min(1),
});

export class TransferGroupOwnershipDto extends createZodDto(
  TransferGroupOwnershipSchema,
) {}
