import { z } from 'zod';

export const UserDomainSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  password: z.string().min(8),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  picture: z.url().optional(),
  provider: z.string().optional(),
  providerId: z.string().optional(),
  isVerified: z.boolean().default(false),
  createdAt: z.date().optional(),
});
