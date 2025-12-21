import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  search: z.string().optional(),
  sort: z.enum(['asc', 'desc']).default('desc'),
});

export class PaginationDto extends createZodDto(paginationSchema) {}
