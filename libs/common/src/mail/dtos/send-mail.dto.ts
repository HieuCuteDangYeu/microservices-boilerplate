import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const sendMailSchema = z.object({
  to: z.email(),
  subject: z.string(),
  template: z.string(),
  context: z.record(z.string(), z.any()),
});

export class SendMailDto extends createZodDto(sendMailSchema) {}
