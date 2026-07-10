import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const SearchSuggestionsQuerySchema = z.object({
  type: z.enum(['all', 'users', 'reels']).default('all'),
  limit: z.coerce.number().int().min(1).max(12).default(8),
});

export class SearchSuggestionsQueryDto extends createZodDto(
  SearchSuggestionsQuerySchema,
) {}
