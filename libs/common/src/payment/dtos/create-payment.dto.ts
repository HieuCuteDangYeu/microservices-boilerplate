import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreatePaymentSchema = z.object({
  amount: z.number().min(1),
  currency: z.string().length(3).default('usd'),
});

export class CreatePaymentDto extends createZodDto(CreatePaymentSchema) {}
