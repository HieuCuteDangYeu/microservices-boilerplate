import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const UpdateGroupMemberRoleSchema = z.object({
  role: z.enum(['ADMIN', 'MEMBER']),
});

export class UpdateGroupMemberRoleDto extends createZodDto(
  UpdateGroupMemberRoleSchema,
) {}
