import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const UpdateAvatarSchema = z.object({
  avatarKey: z
    .string()
    .regex(
      /^avatars\/[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+\.(png|jpg|jpeg|webp)$/,
      'Invalid avatar key format',
    ),
});

export class UpdateAvatarDto extends createZodDto(UpdateAvatarSchema) {}
