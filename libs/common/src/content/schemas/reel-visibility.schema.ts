import { z } from 'zod';

export const ReelVisibilitySchema = z.enum(['public', 'friends', 'private']);

export type ReelVisibility = z.infer<typeof ReelVisibilitySchema>;
